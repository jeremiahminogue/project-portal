import { json } from '@sveltejs/kit';
import { nextFileSortOrder } from '$lib/server/file-folders';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async (event) => {
  const projectSlug = event.url.searchParams.get('projectSlug') ?? '';
  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });

  const access = await requireProjectAccess(event, projectSlug, { writable: true, action: 'delete folders' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ ok: true, moved: 0 });

  const { data: folder, error: folderError } = await client
    .from('files')
    .select('id, name')
    .eq('id', event.params.id)
    .eq('project_id', access.project.id)
    .eq('is_folder', true)
    .maybeSingle();

  if (folderError) return json({ error: folderError.message }, { status: 500 });
  if (!folder) return json({ error: 'Folder not found.' }, { status: 404 });

  const { data: children, error: childrenError } = await client
    .from('files')
    .select('id')
    .eq('project_id', access.project.id)
    .eq('is_folder', false)
    .eq('parent_folder_id', folder.id);

  if (childrenError) return json({ error: childrenError.message }, { status: 500 });

  const childIds = (children ?? []).map((child: { id: string }) => child.id);
  let nextOrder = await nextFileSortOrder(client, access.project.id, null);
  for (const fileId of childIds) {
    const updatePayload: { parent_folder_id: null; sort_order?: number } = { parent_folder_id: null };
    if (nextOrder !== null) updatePayload.sort_order = nextOrder;
    const { error } = await client
      .from('files')
      .update(updatePayload)
      .eq('id', fileId)
      .eq('project_id', access.project.id)
      .eq('is_folder', false);

    if (error) return json({ error: error.message }, { status: 500 });
    if (nextOrder !== null) nextOrder += 100;
  }

  const { error: deleteError } = await client
    .from('files')
    .delete()
    .eq('id', folder.id)
    .eq('project_id', access.project.id)
    .eq('is_folder', true);

  if (deleteError) return json({ error: deleteError.message }, { status: 500 });
  return json({ ok: true, moved: childIds.length, name: folder.name });
};
