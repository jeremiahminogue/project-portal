import type { RequestEvent } from '@sveltejs/kit';
import { createAdminClient } from './supabase-admin';

type AuditDetails = Record<string, unknown>;

function uuidOrNull(value: string | null | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

export async function writeAdminAudit(
  event: RequestEvent,
  action: string,
  targetType: string,
  targetId: string | null,
  details: AuditDetails = {}
) {
  try {
    const me = await event.locals.getCurrentUser();
    const admin = createAdminClient();
    const { error } = await admin.from('admin_audit_log').insert({
      actor_id: uuidOrNull(me.user?.id),
      actor_email: me.user?.email ?? null,
      action,
      target_type: targetType,
      target_id: targetId,
      details
    });

    if (error && error.code !== '42P01') {
      console.error('[admin-audit] insert failed:', error.message);
    }
  } catch (error) {
    console.error('[admin-audit] insert failed:', error instanceof Error ? error.message : error);
  }
}
