import { json } from '@sveltejs/kit';
import { nextFileSortOrder } from '$lib/server/file-folders';
import { databaseClientForProjectAccess, isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async (event) => {
  const projectSlug = event.url.searchParams.get('projectSlug') ?? '';
  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });

  const access = await requireProjectAccess(event, projectSlug, { action: 'delete folders' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  if (!projectRoleCapabilities[access.role].canDeleteFiles) {
    return json({ error: 'Only project admins can delete folders.' }, { status: 403 });
  }

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ ok: true, moved: 0 });

  const { data: folder, error: folderError } = await client
    .from('files')
    .select('id, name, parent_folder_id')
    .eq('id', event.params.id)
    .eq('project_id', access.project.id)
    .eq('is_folder', true)
    .maybeSingle();

  if (folderError) return json({ error: folderError.message }, { status: 500 });
  if (!folder) return json({ error: 'Folder not found.' }, { status: 404 });

  const targetParentFolderId = folder.parent_folder_id ?? null;
  const { data: children, error: childrenError } = await client
    .from('files')
    .select('id')
    .eq('project_id', access.project.id)
    .eq('is_folder', false)
    .eq('parent_folder_id', folder.id);

  if (childrenError) return json({ error: childrenError.message }, { status: 500 });

  const { data: childFolders, error: childFoldersError } = await client
    .from('files')
    .select('id')
    .eq('project_id', access.project.id)
    .eq('is_folder', true)
    .eq('parent_folder_id', folder.id);

  if (childFoldersError) return json({ error: childFoldersError.message }, { status: 500 });

  const childFolderIds = (childFolders ?? []).map((child: { id: string }) => child.id);
  if (childFolderIds.length) {
    const { error: folderMoveError } = await client
      .from('files')
      .update({ parent_folder_id: targetParentFolderId })
      .eq('project_id', access.project.id)
      .eq('is_folder', true)
      .in('id', childFolderIds);

    if (folderMoveError) return json({ error: folderMoveError.message }, { status: 500 });
  }

  const childIds = (children ?? []).map((child: { id: string }) => child.id);
  let nextOrder = await nextFileSortOrder(client, access.project.id, targetParentFolderId);
  for (const fileId of childIds) {
    const updatePayload: { parent_folder_id: string | null; sort_order?: number } = { parent_folder_id: targetParentFolderId };
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
  return json({ ok: true, moved: childIds.length, movedFolders: childFolderIds.length, name: folder.name });
};

export const PATCH: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const projectSlug = typeof body?.projectSlug === 'string' ? body.projectSlug : '';
  const parentFolderId = typeof body?.parentFolderId === 'string' && body.parentFolderId.trim() ? body.parentFolderId.trim() : null;
  const documentKind = typeof body?.documentKind === 'string' ? body.documentKind : null;

  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });

  const access = await requireProjectAccess(event, projectSlug, { writable: true, action: 'move folders' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ ok: true, parentFolderId });

  const { data: folders, error: foldersError } = await client
    .from('files')
    .select('id, parent_folder_id')
    .eq('project_id', access.project.id)
    .eq('is_folder', true);

  if (foldersError) return json({ error: foldersError.message }, { status: 500 });

  const folderMap = new Map((folders ?? []).map((folder: { id: string; parent_folder_id: string | null }) => [folder.id, folder.parent_folder_id]));
  if (!folderMap.has(event.params.id)) return json({ error: 'Folder not found.' }, { status: 404 });
  if (parentFolderId && !folderMap.has(parentFolderId)) return json({ error: 'Parent folder not found.' }, { status: 404 });
  if (parentFolderId === event.params.id) return json({ error: 'A folder cannot be moved into itself.' }, { status: 400 });

  let cursor = parentFolderId;
  while (cursor) {
    if (cursor === event.params.id) return json({ error: 'A folder cannot be moved into one of its subfolders.' }, { status: 400 });
    cursor = folderMap.get(cursor) ?? null;
  }

  const updates: { parent_folder_id: string | null; document_kind?: string } = { parent_folder_id: parentFolderId };
  if (documentKind === 'drawing' || documentKind === 'specification' || documentKind === 'file') updates.document_kind = documentKind;

  const { error } = await client
    .from('files')
    .update(updates)
    .eq('id', event.params.id)
    .eq('project_id', access.project.id)
    .eq('is_folder', true);

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true, parentFolderId });
};
