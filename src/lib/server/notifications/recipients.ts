import type {
  NotificationEventType,
  NotificationRecipient,
  NotificationRule,
  PersistedNotificationEvent,
  RecipientKind
} from './types';

type Client = NonNullable<App.Locals['supabase']>;

type MemberRow = {
  user_id: string;
  role: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ProjectMember = {
  userId: string;
  role: string;
  name: string;
  email: string | null;
};

function tableMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === '42P01' || /does not exist/i.test(candidate?.message ?? '');
}

function metadataString(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function metadataStringArray(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim());
}

async function loadProjectMembers(client: Client, projectId: string): Promise<ProjectMember[]> {
  const { data: members, error: membersError } = await client
    .from('project_members')
    .select('user_id, role')
    .eq('project_id', projectId);

  if (membersError) throw new Error(membersError.message);

  const memberRows = (members ?? []) as MemberRow[];
  const ids = [...new Set(memberRows.map((member) => member.user_id).filter(Boolean))];
  if (!ids.length) return [];

  const { data: profiles, error: profilesError } = await client
    .from('profiles')
    .select('id, full_name, email')
    .in('id', ids);

  if (profilesError) throw new Error(profilesError.message);

  const profileById = new Map((profiles ?? []).map((profile: ProfileRow) => [profile.id, profile]));
  return memberRows.map((member) => {
    const profile = profileById.get(member.user_id);
    return {
      userId: member.user_id,
      role: member.role,
      name: profile?.full_name ?? profile?.email ?? 'Project member',
      email: profile?.email ?? null
    };
  });
}

async function loadProfiles(client: Client, ids: string[]) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (!uniqueIds.length) return new Map<string, ProfileRow>();

  const { data, error } = await client.from('profiles').select('id, full_name, email').in('id', uniqueIds);
  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((profile: ProfileRow) => [profile.id, profile]));
}

async function subscribedUserIds(client: Client, projectId: string) {
  const { data, error } = await client
    .from('photo_subscriptions')
    .select('user_id')
    .eq('project_id', projectId)
    .eq('enabled', true);

  if (error) {
    if (tableMissing(error)) return new Set<string>();
    throw new Error(error.message);
  }

  return new Set(((data ?? []) as { user_id: string }[]).map((row) => row.user_id));
}

function memberRecipient(member: ProjectMember, rule: NotificationRule): NotificationRecipient | null {
  if (!member.email) return null;
  return {
    userId: member.userId,
    email: member.email,
    name: member.name,
    role: member.role,
    kind: rule.recipientKind,
    required: rule.required,
    digestFrequency: rule.digestFrequency
  };
}

function directEmailRecipient(email: string, kind: RecipientKind, required = true): NotificationRecipient {
  return {
    userId: null,
    email,
    name: email,
    kind,
    required,
    digestFrequency: 'immediate'
  };
}

function shouldSkipPrivatePhoto(event: PersistedNotificationEvent, recipient: NotificationRecipient) {
  if (event.type !== 'photo.uploaded' || event.metadata.private !== true) return false;
  if (recipient.userId && recipient.userId === event.actorId) return false;
  return recipient.role !== 'admin' && recipient.kind === 'photo_subscribers';
}

function shouldSkipOptionalRecipient(event: PersistedNotificationEvent, recipient: NotificationRecipient) {
  if (recipient.required) return false;
  const skippedUserIds = metadataStringArray(event.metadata, 'skipUserIds');
  const skippedEmails = metadataStringArray(event.metadata, 'skipEmails').map((email) => email.toLowerCase());
  if (recipient.userId && skippedUserIds.includes(recipient.userId)) return true;
  return skippedEmails.includes(recipient.email.toLowerCase());
}

function mergeRecipient(
  recipients: Map<string, NotificationRecipient>,
  candidate: NotificationRecipient | null,
  event: PersistedNotificationEvent
) {
  if (!candidate || shouldSkipPrivatePhoto(event, candidate) || shouldSkipOptionalRecipient(event, candidate)) return;
  const key = candidate.email.toLowerCase();
  const existing = recipients.get(key);
  if (!existing) {
    recipients.set(key, candidate);
    return;
  }

  recipients.set(key, {
    ...existing,
    required: existing.required || candidate.required,
    digestFrequency:
      existing.digestFrequency === 'immediate' || candidate.digestFrequency === 'immediate' ? 'immediate' : 'hourly',
    kind: existing.required ? existing.kind : candidate.kind
  });
}

export async function resolveNotificationRecipients(
  client: Client,
  event: PersistedNotificationEvent,
  rules: NotificationRule[]
) {
  const members = await loadProjectMembers(client, event.projectId);
  const membersById = new Map(members.map((member) => [member.userId, member]));
  const actorId = event.actorId ?? null;
  const recipients = new Map<string, NotificationRecipient>();
  const photoSubscribers =
    rules.some((rule) => rule.recipientKind === 'photo_subscribers') && event.type === 'photo.uploaded'
      ? await subscribedUserIds(client, event.projectId)
      : new Set<string>();

  for (const rule of rules) {
    if (!rule.enabled && !rule.required) continue;

    if (rule.recipientKind === 'assignee') {
      const assigneeId = metadataString(event.metadata, 'assignedTo') ?? metadataString(event.metadata, 'assigneeId');
      const member = assigneeId ? membersById.get(assigneeId) : null;
      mergeRecipient(recipients, member ? memberRecipient(member, rule) : null, event);
    }

    if (rule.recipientKind === 'creator') {
      const creatorId = metadataString(event.metadata, 'creatorId') ?? metadataString(event.metadata, 'createdBy');
      const member = creatorId ? membersById.get(creatorId) : null;
      mergeRecipient(recipients, member ? memberRecipient(member, rule) : null, event);
    }

    if (rule.recipientKind === 'rfi_manager') {
      const managerId = metadataString(event.metadata, 'rfiManagerId') ?? metadataString(event.metadata, 'rfiManager');
      const member = managerId ? membersById.get(managerId) : null;
      mergeRecipient(recipients, member ? memberRecipient(member, rule) : null, event);
    }

    if (rule.recipientKind === 'project_admins') {
      for (const member of members) {
        if (member.userId === actorId) continue;
        if (member.role === 'admin') mergeRecipient(recipients, memberRecipient(member, rule), event);
      }
    }

    if (rule.recipientKind === 'distribution') {
      for (const member of members) {
        if (member.userId !== actorId) mergeRecipient(recipients, memberRecipient(member, rule), event);
      }
    }

    if (rule.recipientKind === 'owner') {
      const ownerId = metadataString(event.metadata, 'owner') ?? metadataString(event.metadata, 'ownerId');
      const member = ownerId ? membersById.get(ownerId) : null;
      mergeRecipient(recipients, member ? memberRecipient(member, rule) : null, event);
    }

    if (rule.recipientKind === 'workflow_assignee') {
      const assigneeId =
        metadataString(event.metadata, 'workflowAssigneeId') ??
        metadataString(event.metadata, 'owner') ??
        metadataString(event.metadata, 'ownerId');
      const member = assigneeId ? membersById.get(assigneeId) : null;
      mergeRecipient(recipients, member ? memberRecipient(member, rule) : null, event);
    }

    if (rule.recipientKind === 'photo_subscribers') {
      for (const member of members) {
        if (member.userId !== actorId && photoSubscribers.has(member.userId)) {
          mergeRecipient(recipients, memberRecipient(member, rule), event);
        }
      }
    }

    if (rule.recipientKind === 'shared_users') {
      const sharedUserIds = metadataStringArray(event.metadata, 'sharedUserIds');
      const sharedEmails = metadataStringArray(event.metadata, 'sharedEmails');
      const profiles = await loadProfiles(client, sharedUserIds);
      for (const userId of sharedUserIds) {
        const profile = profiles.get(userId);
        if (profile?.email) {
          mergeRecipient(
            recipients,
            {
              userId,
              email: profile.email,
              name: profile.full_name ?? profile.email,
              kind: rule.recipientKind,
              required: rule.required,
              digestFrequency: rule.digestFrequency
            },
            event
          );
        }
      }
      for (const email of sharedEmails) mergeRecipient(recipients, directEmailRecipient(email, rule.recipientKind), event);
    }

    if (rule.recipientKind === 'mentioned_users') {
      const mentionedUserIds = metadataStringArray(event.metadata, 'mentionedUserIds');
      const profiles = await loadProfiles(client, mentionedUserIds);
      for (const userId of mentionedUserIds) {
        const profile = profiles.get(userId);
        if (profile?.email) {
          mergeRecipient(
            recipients,
            {
              userId,
              email: profile.email,
              name: profile.full_name ?? profile.email,
              kind: rule.recipientKind,
              required: rule.required,
              digestFrequency: rule.digestFrequency
            },
            event
          );
        }
      }
    }
  }

  return [...recipients.values()];
}

export function eventImpliesActionRequired(type: NotificationEventType) {
  return type === 'submittal.action_required' || type === 'rfi.ball_in_court_shift';
}
