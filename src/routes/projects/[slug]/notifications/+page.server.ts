import { error as kitError, fail } from '@sveltejs/kit';
import { actionError } from '$lib/server/auth';
import {
  defaultNotificationRules,
  loadPhotoSubscription,
  loadProjectNotificationRules,
  loadUserNotificationPreferences,
  notificationEventDefinitions,
  recipientKindDefinitions,
  saveProjectNotificationRules,
  saveUserNotificationPreferences
} from '$lib/server/notifications';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getProject } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

type DeliveryLogRow = {
  id: string;
  created_at: string;
  recipient_email: string | null;
  subject: string;
  status: string;
  error: string | null;
  metadata: Record<string, unknown> | null;
};

function tableMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === '42P01' || /does not exist/i.test(candidate?.message ?? '');
}

async function recentDeliveries(client: NonNullable<App.Locals['supabase']>, projectId: string) {
  const { data, error } = await client
    .from('notification_deliveries')
    .select('id, created_at, recipient_email, subject, status, error, metadata')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) {
    if (tableMissing(error)) return [];
    throw new Error(error.message);
  }

  return ((data ?? []) as DeliveryLogRow[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    recipient: row.recipient_email ?? 'No email',
    subject: row.subject,
    status: row.status,
    error: row.error,
    eventType: typeof row.metadata?.event_type === 'string' ? row.metadata.event_type : ''
  }));
}

export const load: PageServerLoad = async (event) => {
  const project = await getProject(event, event.params.slug);
  const access = await requireProjectAccess(event, event.params.slug);
  if (isProjectAccessError(access)) throw kitError(access.status, access.message);

  if (!event.locals.supabase) {
    return {
      project,
      access: { role: access.role, canManageRules: true },
      eventDefinitions: notificationEventDefinitions,
      recipientDefinitions: recipientKindDefinitions,
      preferences: Object.fromEntries(notificationEventDefinitions.map((definition) => [definition.type, definition.userConfigurable])),
      photoSubscribed: false,
      rules: defaultNotificationRules,
      deliveries: [],
      deliveriesScope: 'project'
    };
  }

  const client = databaseClientForProjectAccess(event, access);
  if (!client) throw kitError(503, 'Supabase is not configured yet.');

  const [preferences, photoSubscribed, rules, deliveries] = await Promise.all([
    loadUserNotificationPreferences(client, access.project.id, access.user.id),
    loadPhotoSubscription(client, access.project.id, access.user.id),
    loadProjectNotificationRules(client, access.project.id),
    recentDeliveries(client, access.project.id)
  ]);

  return {
    project,
    access: {
      role: access.role,
      canManageRules: ['superadmin', 'admin'].includes(access.role)
    },
    eventDefinitions: notificationEventDefinitions,
    recipientDefinitions: recipientKindDefinitions,
    preferences: Object.fromEntries(preferences),
    photoSubscribed,
    rules,
    deliveries,
    deliveriesScope: ['superadmin', 'admin'].includes(access.role) ? 'project' : 'mine'
  };
};

export const actions: Actions = {
  savePreferences: async (event) => {
    const access = await requireProjectAccess(event, event.params.slug);
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const enabledEvents = new Set(form.getAll('eventTypes').filter((value): value is string => typeof value === 'string'));
    const photoSubscribed = form.get('photoDigest') === 'on';

    try {
      await saveUserNotificationPreferences(client, access.project.id, access.user.id, enabledEvents, photoSubscribed);
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not save notification preferences.' });
    }

    return { ok: true };
  },

  saveMatrix: async (event) => {
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'manage project notification rules'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const enabledRuleKeys = new Set(form.getAll('rules').filter((value): value is string => typeof value === 'string'));
    try {
      await saveProjectNotificationRules(client, access.project.id, enabledRuleKeys);
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not save notification matrix.' });
    }

    return { ok: true };
  }
};
