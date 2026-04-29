import {
  defaultNotificationRules,
  notificationEventDefinitions,
  type DigestFrequency,
  type NotificationEventType,
  type NotificationRule,
  type RecipientKind
} from './types';

type Client = NonNullable<App.Locals['supabase']>;

type RuleRow = {
  event_type: NotificationEventType;
  recipient_kind: RecipientKind;
  enabled: boolean;
  required: boolean;
  digest_frequency: DigestFrequency;
};

type PreferenceRow = {
  event_type: NotificationEventType;
  enabled: boolean;
};

function tableMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === '42P01' || /does not exist/i.test(candidate?.message ?? '');
}

function rowToRule(row: RuleRow): NotificationRule {
  const digestFrequency =
    row.digest_frequency === 'daily' || row.digest_frequency === 'hourly' ? row.digest_frequency : 'immediate';
  return {
    eventType: row.event_type,
    recipientKind: row.recipient_kind,
    enabled: Boolean(row.enabled),
    required: Boolean(row.required),
    digestFrequency
  };
}

function ruleKey(rule: Pick<NotificationRule, 'eventType' | 'recipientKind'>) {
  return `${rule.eventType}:${rule.recipientKind}`;
}

export function defaultRulesForEvent(type: NotificationEventType) {
  return defaultNotificationRules.filter((rule) => rule.eventType === type);
}

export async function loadNotificationRules(client: Client, projectId: string, type: NotificationEventType) {
  const defaults = defaultRulesForEvent(type);
  const byKey = new Map(defaults.map((rule) => [ruleKey(rule), rule]));

  const { data, error } = await client
    .from('notification_rules')
    .select('event_type, recipient_kind, enabled, required, digest_frequency')
    .eq('project_id', projectId)
    .eq('event_type', type);

  if (error) {
    if (tableMissing(error)) return defaults;
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as RuleRow[]) {
    byKey.set(ruleKey({ eventType: row.event_type, recipientKind: row.recipient_kind }), rowToRule(row));
  }

  return [...byKey.values()].filter((rule) => rule.enabled || rule.required);
}

export async function loadProjectNotificationRules(client: Client, projectId: string) {
  const byKey = new Map(defaultNotificationRules.map((rule) => [ruleKey(rule), { ...rule, inherited: true }]));

  const { data, error } = await client
    .from('notification_rules')
    .select('event_type, recipient_kind, enabled, required, digest_frequency')
    .eq('project_id', projectId);

  if (error) {
    if (tableMissing(error)) return [...byKey.values()];
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as RuleRow[]) {
    byKey.set(ruleKey({ eventType: row.event_type, recipientKind: row.recipient_kind }), {
      ...rowToRule(row),
      inherited: false
    });
  }

  return [...byKey.values()];
}

export async function loadUserNotificationPreferences(client: Client, projectId: string, userId: string) {
  const defaults = new Map(
    notificationEventDefinitions.map((definition) => [definition.type, definition.userConfigurable])
  );

  const { data, error } = await client
    .from('notification_preferences')
    .select('event_type, enabled')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .eq('channel', 'email');

  if (error) {
    if (tableMissing(error)) return defaults;
    throw new Error(error.message);
  }

  for (const row of (data ?? []) as PreferenceRow[]) {
    defaults.set(row.event_type, Boolean(row.enabled));
  }
  return defaults;
}

export async function preferenceAllows(
  client: Client,
  projectId: string,
  recipientUserId: string | null,
  eventType: NotificationEventType,
  required: boolean
) {
  if (eventType === 'photo.uploaded') return true;
  if (required || !recipientUserId) return true;

  const { data, error } = await client
    .from('notification_preferences')
    .select('enabled')
    .eq('project_id', projectId)
    .eq('user_id', recipientUserId)
    .eq('event_type', eventType)
    .eq('channel', 'email')
    .maybeSingle();

  if (error) {
    if (tableMissing(error)) return true;
    throw new Error(error.message);
  }

  return data?.enabled !== false;
}

export async function loadPhotoSubscription(client: Client, projectId: string, userId: string) {
  const { data, error } = await client
    .from('photo_subscriptions')
    .select('enabled')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (tableMissing(error)) return false;
    throw new Error(error.message);
  }

  return Boolean(data?.enabled);
}

export async function saveUserNotificationPreferences(
  client: Client,
  projectId: string,
  userId: string,
  enabledEvents: Set<string>,
  photoSubscribed: boolean
) {
  const rows = notificationEventDefinitions
    .filter((definition) => definition.userConfigurable && definition.type !== 'photo.uploaded')
    .map((definition) => ({
      project_id: projectId,
      user_id: userId,
      event_type: definition.type,
      channel: 'email',
      enabled: enabledEvents.has(definition.type)
    }));

  const preferences = await client
    .from('notification_preferences')
    .upsert(rows, { onConflict: 'project_id,user_id,event_type,channel' });
  if (preferences.error) throw new Error(preferences.error.message);

  const subscription = await client.from('photo_subscriptions').upsert(
    {
      project_id: projectId,
      user_id: userId,
      enabled: photoSubscribed
    },
    { onConflict: 'project_id,user_id' }
  );
  if (subscription.error) throw new Error(subscription.error.message);
}

export async function saveProjectNotificationRules(client: Client, projectId: string, enabledRuleKeys: Set<string>) {
  const rows = defaultNotificationRules.map((rule) => ({
    project_id: projectId,
    event_type: rule.eventType,
    recipient_kind: rule.recipientKind,
    enabled: rule.required || enabledRuleKeys.has(ruleKey(rule)),
    required: rule.required,
    digest_frequency: rule.digestFrequency
  }));

  const { error } = await client.from('notification_rules').upsert(rows, {
    onConflict: 'project_id,event_type,recipient_kind'
  });
  if (error) throw new Error(error.message);
}

export function notificationRuleKey(rule: Pick<NotificationRule, 'eventType' | 'recipientKind'>) {
  return ruleKey(rule);
}
