import { error as kitError, fail, redirect } from '@sveltejs/kit';
import { actionError } from '$lib/server/auth';
import { escapeHtml, sendPortalEmail } from '$lib/server/email';
import { serverEnv } from '$lib/server/env';
import {
  defaultNotificationRules,
  loadPhotoSubscription,
  loadProjectNotificationRules,
  loadUserNotificationPreferences,
  notificationEventDefinitions,
  recipientKindDefinitions,
  saveProjectNotificationRules,
  saveUserNotificationPreferences,
  retryNotificationDelivery
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

const DEFAULT_EMAIL_FROM = 'Pueblo Electric Portal <noreply@send.puebloelectrics.com>';

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
  if (!['superadmin', 'admin'].includes(access.role)) throw redirect(303, `/projects/${event.params.slug}`);

  const emailFrom = serverEnv('RESEND_FROM') ?? DEFAULT_EMAIL_FROM;
  const emailProviderConfigured = Boolean(serverEnv('RESEND_API_KEY'));

  if (!event.locals.supabase) {
    return {
      project,
      access: { role: access.role, canManageRules: true },
      adminEmail: access.user.email,
      emailFrom,
      emailProviderConfigured,
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
    adminEmail: access.user.email,
    emailFrom,
    emailProviderConfigured,
    eventDefinitions: notificationEventDefinitions,
    recipientDefinitions: recipientKindDefinitions,
    preferences: Object.fromEntries(preferences),
    photoSubscribed,
    rules,
    deliveries,
    deliveriesScope: 'project'
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
  },

  retryDelivery: async (event) => {
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'retry project notification deliveries'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);
    const client = databaseClientForProjectAccess(event, access);
    if (!client) return actionError('Supabase is not configured yet.');

    const form = await event.request.formData();
    const id = form.get('id');
    if (typeof id !== 'string' || !id) return fail(400, { error: 'Delivery id is required.' });

    const { data: delivery, error } = await client
      .from('notification_deliveries')
      .select('id')
      .eq('id', id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (error) return fail(400, { error: error.message });
    if (!delivery) return fail(404, { error: 'Delivery not found.' });

    try {
      await retryNotificationDelivery(client, id);
    } catch (retryError) {
      return fail(400, { error: retryError instanceof Error ? retryError.message : 'Could not retry delivery.' });
    }

    return { ok: true };
  },

  sendTestEmail: async (event) => {
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'send project notification test emails'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const form = await event.request.formData();
    const recipient = typeof form.get('recipient') === 'string' && String(form.get('recipient')).trim()
      ? String(form.get('recipient')).trim()
      : access.user.email;
    if (!recipient) return fail(400, { error: 'Enter an email address for the test.' });

    const projectName = access.project.name ?? access.project.slug;
    const sentAt = new Date().toLocaleString('en-US', {
      timeZone: 'America/Denver',
      dateStyle: 'medium',
      timeStyle: 'short'
    });
    const result = await sendPortalEmail({
      to: recipient,
      subject: `Test notification - ${projectName}`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#191b19">
          <h2 style="margin:0 0 12px">Pueblo Electric Portal test notification</h2>
          <p>This confirms the portal can send notification email for <strong>${escapeHtml(projectName)}</strong>.</p>
          <p>Requested by ${escapeHtml(access.user.email ?? 'a project admin')} on ${escapeHtml(sentAt)}.</p>
        </div>
      `
    });

    const providerError = result && typeof result === 'object' && 'error' in result ? String((result as { error?: unknown }).error ?? '') : '';
    if (providerError) return fail(400, { error: `Test email failed: ${providerError}` });
    const skipped = result && typeof result === 'object' && 'skipped' in result && (result as { skipped?: unknown }).skipped === true;
    if (skipped) return { ok: true, message: 'Email provider is not configured yet, so no test email was sent.' };

    return { ok: true, message: `Test email sent to ${recipient}.` };
  }
};
