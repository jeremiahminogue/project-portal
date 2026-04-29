import { error } from '@sveltejs/kit';
import { contentDisposition, getObject, responseBody, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { createAdminClient, hasSupabaseAdminConfig } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  if (!hasSupabaseAdminConfig()) throw error(503, 'Share links require Supabase service configuration.');
  const admin = createAdminClient();
  const { data: token, error: tokenError } = await admin
    .from('share_tokens')
    .select('id, resource_type, resource_id, expires_at, view_count')
    .eq('token', params.token)
    .maybeSingle();
  if (tokenError) throw error(500, tokenError.message);
  if (!token) throw error(404, 'Share link not found.');
  if (token.expires_at && new Date(token.expires_at).getTime() < Date.now()) throw error(410, 'Share link expired.');

  await admin
    .from('share_tokens')
    .update({ view_count: (token.view_count ?? 0) + 1 })
    .eq('id', token.id);

  if (token.resource_type === 'file') {
    const { data: file, error: fileError } = await admin
      .from('files')
      .select('name, storage_key, mime_type')
      .eq('id', token.resource_id)
      .eq('is_folder', false)
      .maybeSingle();
    if (fileError) throw error(500, fileError.message);
    if (!file?.storage_key) throw error(404, 'Shared file not found.');

    try {
      const object = await getObject(file.storage_key);
      return new Response(responseBody(object.Body), {
        headers: {
          'Content-Type': file.mime_type ?? object.ContentType ?? 'application/octet-stream',
          'Content-Disposition': contentDisposition(file.name, 'attachment'),
          'Cache-Control': 'private, max-age=60'
        }
      });
    } catch (readError) {
      throw error(storageErrorStatus(readError), storageErrorMessage(readError, 'read this shared file'));
    }
  }

  throw error(404, 'Shared resource type is not supported.');
};
