import { json } from '@sveltejs/kit';
import { cleanFolderName, folderIdFor, nextFileSortOrder } from '$lib/server/file-folders';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

function stringArray(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === 'string' && item.length > 0))] : [];
}

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const projectSlug = typeof body?.projectSlug === 'string' ? body.projectSlug : '';
  const fileIds = stringArray(body?.fileIds);
  const orderedFileIds = stringArray(body?.orderedFileIds);
  const folderId = typeof body?.folderId === 'string' ? body.folderId.trim() : '';
  const folderName = cleanFolderName(body?.folderName);
  const documentKind = typeof body?.documentKind === 'string' ? body.documentKind : 'file';

  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });
  if (fileIds.length === 0) return json({ error: 'Select at least one file to move.' }, { status: 400 });
  if ([...fileIds, ...orderedFileIds].some((id) => id.startsWith('storage:'))) {
    return json({ error: 'Storage-only files need to be registered before they can be moved.' }, { status: 400 });
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true, action: 'reorder files' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ moved: fileIds.length, ordered: orderedFileIds.length });

  try {
    let targetFolderId: string | null = null;
    if (folderId) {
      const { data: folder, error: folderError } = await client
        .from('files')
        .select('id')
        .eq('id', folderId)
        .eq('project_id', access.project.id)
        .eq('is_folder', true)
        .maybeSingle();

      if (folderError) return json({ error: folderError.message }, { status: 500 });
      if (!folder) return json({ error: 'Folder not found.' }, { status: 404 });
      targetFolderId = folder.id as string;
    } else if (folderName) {
      targetFolderId = await folderIdFor(client, access.project.id, folderName, access.user.id, documentKind);
    }

    if (orderedFileIds.length) {
      for (const [index, fileId] of orderedFileIds.entries()) {
        const { error } = await client
          .from('files')
          .update({ parent_folder_id: targetFolderId, sort_order: (index + 1) * 100 })
          .eq('id', fileId)
          .eq('project_id', access.project.id)
          .eq('is_folder', false);
        if (error) return json({ error: error.message }, { status: 500 });
      }
    } else {
      let nextOrder = await nextFileSortOrder(client, access.project.id, targetFolderId);
      for (const fileId of fileIds) {
        const { error } = await client
          .from('files')
          .update({ parent_folder_id: targetFolderId, sort_order: nextOrder })
          .eq('id', fileId)
          .eq('project_id', access.project.id)
          .eq('is_folder', false);
        if (error) return json({ error: error.message }, { status: 500 });
        nextOrder += 100;
      }
    }

    return json({ moved: fileIds.length, ordered: orderedFileIds.length, folderId: targetFolderId });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Files could not be reordered.' }, { status: 500 });
  }
};

