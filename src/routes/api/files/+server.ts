import { json } from '@sveltejs/kit';
import { encodeStorageId } from '$lib/server/object-storage';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const MAX_BYTES = 100 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
  const { request, locals } = event;
  const body = await request.json().catch(() => null);

  const { projectSlug, key, name, sizeBytes, mimeType, folderName, tags } = body ?? {};
  if (
    typeof projectSlug !== 'string' ||
    typeof key !== 'string' ||
    typeof name !== 'string' ||
    typeof mimeType !== 'string'
  ) {
    return json({ error: 'Missing file fields.' }, { status: 400 });
  }
  if (typeof sizeBytes !== 'number' || sizeBytes < 0 || sizeBytes > MAX_BYTES) return json({ error: 'Invalid file size.' }, { status: 400 });

  if (!locals.supabase) {
    return json({ id: encodeStorageId(key), name, storageKey: key }, { status: 201 });
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  let parentFolderId: string | null = null;
  if (typeof folderName === 'string' && folderName) {
    const { data: folder } = await locals.supabase
      .from('files')
      .select('id')
      .eq('project_id', access.project.id)
      .eq('is_folder', true)
      .eq('name', folderName)
      .maybeSingle();
    parentFolderId = folder?.id ?? null;

    if (!parentFolderId) {
      const { data: createdFolder, error: folderError } = await locals.supabase
        .from('files')
        .insert({
          project_id: access.project.id,
          name: folderName,
          is_folder: true,
          uploaded_by: access.user.id
        })
        .select('id')
        .single();

      if (folderError) return json({ error: folderError.message }, { status: 500 });
      parentFolderId = createdFolder.id;
    }
  }

  const { data, error } = await locals.supabase
    .from('files')
    .insert({
      project_id: access.project.id,
      parent_folder_id: parentFolderId,
      name,
      is_folder: false,
      storage_key: key,
      size_bytes: sizeBytes,
      mime_type: mimeType,
      uploaded_by: access.user.id,
      tags: Array.isArray(tags) ? tags : []
    })
    .select('id, name, storage_key')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ id: data.id, name: data.name, storageKey: data.storage_key }, { status: 201 });
};
