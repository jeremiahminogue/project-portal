import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { sendPortalEmail } from '$lib/server/email';
import { serverEnv } from '$lib/server/env';
import { requestHasSecret } from '$lib/server/security';
import { createAdminClient, hasSupabaseAdminConfig } from '$lib/server/supabase-admin';
import { loadNotificationRules, preferenceAllows } from './rules';
import { renderNotificationEmail, renderPhotoDigestEmail } from './renderers';
import { resolveNotificationRecipients } from './recipients';
import type { NotificationEventInput, NotificationRecipient, PersistedNotificationEvent } from './types';

type Client = NonNullable<App.Locals['supabase']>;

type EventRow = {
  id: string;
  project_id: string;
  type: PersistedNotificationEvent['type'];
  entity_type: PersistedNotificationEvent['entityType'];
  entity_id: string | null;
  actor_id: string | null;
  dedupe_key: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

type DeliveryRow = {
  id: string;
  event_id: string;
  project_id: string;
  recipient_user_id: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

function tableMissing(error: unknown) {
  const candidate = error as { code?: string; message?: string } | null;
  return candidate?.code === '42P01' || /does not exist/i.test(candidate?.message ?? '');
}

function notificationClient(_event?: Pick<RequestEvent, 'locals'> | null): Client | null {
  if (hasSupabaseAdminConfig()) return createAdminClient();
  return null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function dedupeKeyFor(input: NotificationEventInput) {
  if (input.dedupeKey) return input.dedupeKey;
  const hash = createHash('sha256').update(stableJson(input.metadata ?? {})).digest('hex').slice(0, 16);
  return [input.projectId, input.type, input.entityType, input.entityId ?? 'none', hash].join(':');
}

function rowToEvent(row: EventRow): PersistedNotificationEvent {
  return {
    id: row.id,
    projectId: row.project_id,
    actorId: row.actor_id,
    type: row.type,
    entityType: row.entity_type,
    entityId: row.entity_id,
    dedupeKey: row.dedupe_key,
    metadata: row.metadata ?? {},
    createdAt: row.created_at
  };
}

async function persistEvent(client: Client, input: NotificationEventInput) {
  const dedupeKey = dedupeKeyFor(input);
  const existing = await client
    .from('notification_events')
    .select('id, project_id, type, entity_type, entity_id, actor_id, dedupe_key, metadata, created_at')
    .eq('dedupe_key', dedupeKey)
    .maybeSingle();

  if (existing.error) {
    if (tableMissing(existing.error)) return { skipped: true as const, reason: 'missing_schema' };
    throw new Error(existing.error.message);
  }

  if (existing.data) return { duplicate: true as const, event: rowToEvent(existing.data as EventRow) };

  const inserted = await client
    .from('notification_events')
    .insert({
      project_id: input.projectId,
      type: input.type,
      entity_type: input.entityType,
      entity_id: input.entityId,
      actor_id: input.actorId,
      dedupe_key: dedupeKey,
      metadata: input.metadata ?? {}
    })
    .select('id, project_id, type, entity_type, entity_id, actor_id, dedupe_key, metadata, created_at')
    .single();

  if (inserted.error) {
    if (tableMissing(inserted.error)) return { skipped: true as const, reason: 'missing_schema' };
    throw new Error(inserted.error.message);
  }

  return { event: rowToEvent(inserted.data as EventRow) };
}

async function insertDelivery(
  client: Client,
  event: PersistedNotificationEvent,
  recipient: NotificationRecipient,
  rendered: { subject: string; html: string }
) {
  const status = recipient.digestFrequency === 'hourly' ? 'queued' : 'pending';
  const existing = await client
    .from('notification_deliveries')
    .select('id, status')
    .eq('event_id', event.id)
    .eq('recipient_email', recipient.email)
    .eq('channel', 'email')
    .maybeSingle();

  if (existing.error) throw new Error(existing.error.message);
  if (existing.data) return { duplicate: true as const, deliveryId: existing.data.id as string };

  const { data, error } = await client
    .from('notification_deliveries')
    .insert({
      event_id: event.id,
      project_id: event.projectId,
      recipient_user_id: recipient.userId,
      recipient_email: recipient.email,
      recipient_name: recipient.name,
      subject: rendered.subject,
      html: rendered.html,
      status,
      metadata: {
        event_type: event.type,
        recipient_kind: recipient.kind,
        digest_frequency: recipient.digestFrequency,
        required: recipient.required
      }
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  return { deliveryId: data.id as string, queued: status === 'queued' };
}

async function sendDelivery(
  client: Client,
  deliveryId: string,
  recipient: NotificationRecipient,
  rendered: { subject: string; html: string }
) {
  let result: Awaited<ReturnType<typeof sendPortalEmail>>;
  try {
    result = await sendPortalEmail({
      to: recipient.email,
      subject: rendered.subject,
      html: rendered.html
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Email provider request failed.';
    await client
      .from('notification_deliveries')
      .update({ status: 'failed', error: message, sent_at: new Date().toISOString() })
      .eq('id', deliveryId);
    return { error: message };
  }

  if ('skipped' in result) {
    await client.from('notification_deliveries').update({ status: 'skipped', sent_at: new Date().toISOString() }).eq('id', deliveryId);
    return { skipped: true };
  }

  if ('error' in result) {
    await client
      .from('notification_deliveries')
      .update({ status: 'failed', error: result.error, sent_at: new Date().toISOString() })
      .eq('id', deliveryId);
    return { error: result.error };
  }

  await client
    .from('notification_deliveries')
    .update({ status: 'sent', provider_message_id: result.id ?? null, sent_at: new Date().toISOString() })
    .eq('id', deliveryId);
  return { sent: true };
}

export async function processNotificationEvent(client: Client, event: PersistedNotificationEvent) {
  try {
    const rules = await loadNotificationRules(client, event.projectId, event.type);
    const recipients = await resolveNotificationRecipients(client, event, rules);
    let deliveries = 0;

    for (const recipient of recipients) {
      if (!(await preferenceAllows(client, event.projectId, recipient.userId, event.type, recipient.required))) continue;

      const rendered = renderNotificationEmail(event, recipient);
      const inserted = await insertDelivery(client, event, recipient, rendered);
      if ('duplicate' in inserted) continue;
      deliveries += 1;
      if (!inserted.queued) await sendDelivery(client, inserted.deliveryId, recipient, rendered);
    }

    await client
      .from('notification_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), error: null })
      .eq('id', event.id);
    return { deliveries };
  } catch (error) {
    await client
      .from('notification_events')
      .update({
        status: 'failed',
        processed_at: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Notification processing failed.'
      })
      .eq('id', event.id);
    throw error;
  }
}

export async function notifyProjectEvent(event: RequestEvent, input: NotificationEventInput) {
  const client = notificationClient(event);
  if (!client) return { skipped: true, reason: 'no_service_role' };

  const persisted = await persistEvent(client, input);
  if ('skipped' in persisted) return persisted;
  if ('duplicate' in persisted) return { duplicate: true, eventId: persisted.event.id };

  const processed = await processNotificationEvent(client, persisted.event);
  return { eventId: persisted.event.id, ...processed };
}

function authMatchesSecret(request: Request) {
  const expected = serverEnv('NOTIFICATION_CRON_SECRET', 'CRON_SECRET');
  return requestHasSecret(request, expected, 'x-notification-secret');
}

export function canRunNotificationCron(request: Request) {
  const expected = serverEnv('NOTIFICATION_CRON_SECRET', 'CRON_SECRET');
  if (!expected) return process.env.NODE_ENV !== 'production';
  return authMatchesSecret(request);
}

export async function flushPhotoDigestNotifications(event?: Pick<RequestEvent, 'locals'> | null) {
  const client = notificationClient(event);
  if (!client) return { skipped: true, reason: 'no_service_role' };

  const { data, error } = await client
    .from('notification_deliveries')
    .select('id, event_id, project_id, recipient_user_id, recipient_email, recipient_name, metadata, created_at')
    .eq('status', 'queued')
    .limit(1000);

  if (error) {
    if (tableMissing(error)) return { skipped: true, reason: 'missing_schema' };
    throw new Error(error.message);
  }

  const deliveries = ((data ?? []) as DeliveryRow[]).filter(
    (delivery) => delivery.metadata?.event_type === 'photo.uploaded' && delivery.metadata?.digest_frequency === 'hourly'
  );
  if (!deliveries.length) return { sent: 0, skipped: 0, failed: 0 };

  const eventIds = [...new Set(deliveries.map((delivery) => delivery.event_id))];
  const { data: eventRows, error: eventError } = await client
    .from('notification_events')
    .select('id, project_id, type, entity_type, entity_id, actor_id, dedupe_key, metadata, created_at')
    .in('id', eventIds);
  if (eventError) throw new Error(eventError.message);

  const projectIds = [...new Set(deliveries.map((delivery) => delivery.project_id))];
  const { data: projects, error: projectsError } = await client.from('projects').select('id, slug, name').in('id', projectIds);
  if (projectsError) throw new Error(projectsError.message);

  const deliveryIds = deliveries.map((delivery) => delivery.id);
  await client.from('notification_deliveries').update({ status: 'processing' }).in('id', deliveryIds);

  const eventById = new Map(((eventRows ?? []) as EventRow[]).map((row) => [row.id, rowToEvent(row)]));
  const projectById = new Map(((projects ?? []) as { id: string; slug: string; name: string }[]).map((project) => [project.id, project]));
  const groups = new Map<string, DeliveryRow[]>();
  for (const delivery of deliveries) {
    const key = `${delivery.project_id}:${delivery.recipient_email?.toLowerCase() ?? delivery.recipient_user_id ?? delivery.id}`;
    groups.set(key, [...(groups.get(key) ?? []), delivery]);
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const group of groups.values()) {
    const first = group[0];
    const recipientEmail = first.recipient_email;
    const project = projectById.get(first.project_id);
    if (!recipientEmail || !project) {
      await client.from('notification_deliveries').update({ status: 'failed', error: 'Missing recipient or project.' }).in(
        'id',
        group.map((delivery) => delivery.id)
      );
      failed += group.length;
      continue;
    }

    const photos = group.flatMap((delivery) => {
      const notificationEvent = eventById.get(delivery.event_id);
      if (!notificationEvent) return [];
      return {
        fileId: notificationEvent.entityId,
        fileName: String(notificationEvent.metadata.fileName ?? 'Uploaded photo'),
        folderName: typeof notificationEvent.metadata.folderName === 'string' ? notificationEvent.metadata.folderName : null,
        uploadedBy:
          typeof notificationEvent.metadata.actorName === 'string'
            ? notificationEvent.metadata.actorName
            : typeof notificationEvent.metadata.actorEmail === 'string'
              ? notificationEvent.metadata.actorEmail
              : null,
        createdAt: notificationEvent.createdAt
      };
    });
    const ids = group.map((delivery) => delivery.id);
    if (!photos.length) {
      await client
        .from('notification_deliveries')
        .update({ status: 'failed', error: 'Missing notification event for digest delivery.' })
        .in('id', ids);
      failed += group.length;
      continue;
    }

    const rendered = renderPhotoDigestEmail({
      projectName: project.name,
      projectSlug: project.slug,
      recipientName: first.recipient_name ?? recipientEmail,
      photos
    });
    let result: Awaited<ReturnType<typeof sendPortalEmail>>;
    try {
      result = await sendPortalEmail({ to: recipientEmail, subject: rendered.subject, html: rendered.html });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email provider request failed.';
      await client
        .from('notification_deliveries')
        .update({ status: 'failed', error: message, sent_at: new Date().toISOString() })
        .in('id', ids);
      failed += group.length;
      continue;
    }
    if ('skipped' in result) {
      await client.from('notification_deliveries').update({ status: 'skipped', sent_at: new Date().toISOString() }).in('id', ids);
      skipped += group.length;
    } else if ('error' in result) {
      await client
        .from('notification_deliveries')
        .update({ status: 'failed', error: result.error, sent_at: new Date().toISOString() })
        .in('id', ids);
      failed += group.length;
    } else {
      await client
        .from('notification_deliveries')
        .update({ status: 'sent', provider_message_id: result.id ?? null, sent_at: new Date().toISOString() })
        .in('id', ids);
      sent += group.length;
      if (first.recipient_user_id) {
        await client
          .from('photo_subscriptions')
          .update({ last_digest_at: new Date().toISOString() })
          .eq('project_id', first.project_id)
          .eq('user_id', first.recipient_user_id);
      }
    }
  }

  return { sent, skipped, failed };
}
