import { json } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { notifyProjectEvent } from '$lib/server/notifications';
import { databaseClientForCurrentUser, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { createAdminClient, hasSupabaseAdminConfig } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function parseSharedEmails(value: string) {
  const emails = [
    ...new Set(
      value
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
    )
  ];
  const invalid = emails.find((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));
  if (invalid) throw new Error(`"${invalid}" is not a valid email address.`);
  if (emails.length > 25) throw new Error('Share with up to 25 email recipients at a time.');
  return emails;
}

export const POST: RequestHandler = async (event) => {
  const client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });
  if (!hasSupabaseAdminConfig()) {
    return json({ error: 'External share links require Supabase service configuration.' }, { status: 503 });
  }

  const { data: file, error } = await client
    .from('files')
    .select('id, name, mime_type, project_id, projects:project_id (slug)')
    .eq('id', event.params.id)
    .eq('is_folder', false)
    .maybeSingle();
  if (error) return json({ error: error.message }, { status: 500 });
  if (!file) return json({ error: 'File not found.' }, { status: 404 });

  const project = Array.isArray(file.projects) ? file.projects[0] : file.projects;
  if (!project?.slug) return json({ error: 'Project not found.' }, { status: 404 });
  const access = await requireProjectAccess(event, project.slug, {
    roles: ['superadmin', 'admin'],
    action: 'create external share links for this project'
  });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const form = await event.request.formData().catch(() => new FormData());
  const days = Math.min(30, Math.max(1, Number(formString(form, 'days') || 7)));
  let sharedEmails: string[] = [];
  try {
    sharedEmails = parseSharedEmails(formString(form, 'emails'));
  } catch (parseError) {
    return json({ error: parseError instanceof Error ? parseError.message : 'Could not parse email recipients.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const token = crypto.randomUUID().replaceAll('-', '');
  const expiresAt = daysFromNow(days);
  const { error: insertError } = await admin.from('share_tokens').insert({
    token,
    resource_type: 'file',
    resource_id: file.id,
    created_by: access.user.id,
    expires_at: expiresAt
  });
  if (insertError) return json({ error: insertError.message }, { status: 400 });
  const shareUrl = `${event.url.origin}/share/${token}`;

  if (sharedEmails.length && (file.mime_type?.startsWith('image/') || /\.(png|jpe?g|gif|bmp|tiff?)$/i.test(file.name))) {
    await notifyProjectEvent(event, {
      projectId: file.project_id,
      actorId: access.user.id,
      type: 'photo.shared',
      entityType: 'photo',
      entityId: file.id,
      dedupeKey: `${file.project_id}:photo.shared:${file.id}:${token}`,
      metadata: {
        projectSlug: project.slug,
        projectName: access.project.name,
        actorEmail: access.user.email,
        fileName: file.name,
        sharedEmails,
        shareUrl
      }
    }).catch((notificationError) => console.error('[notifications] photo share notification failed:', notificationError));
  }

  return json({
    url: shareUrl,
    expiresAt,
    name: file.name
  });
};
