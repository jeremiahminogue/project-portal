import { json } from '@sveltejs/kit';
import { cleanFolderName, folderIdFor } from '$lib/server/file-folders';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

function cleanName(value: unknown) {
  return cleanFolderName(value);
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function normalizedDocumentKind(value: unknown) {
  return value === 'drawing' || value === 'specification' || value === 'file' ? value : null;
}

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const projectSlug = typeof body?.projectSlug === 'string' ? body.projectSlug : '';
  const folderId = typeof body?.folderId === 'string' ? body.folderId : '';
  const name = cleanName(body?.name);
  const fileIds = stringArray(body?.fileIds);
  const documentKind = normalizedDocumentKind(body?.documentKind);

  if (!projectSlug) return json({ error: 'Project is required.' }, { status: 400 });
  if (!name) return json({ error: 'Folder name is required.' }, { status: 400 });

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  try {
    if (folderId) {
      const { data: folder, error: folderError } = await client
        .from('files')
        .select('id, name')
        .eq('id', folderId)
        .eq('project_id', access.project.id)
        .eq('is_folder', true)
        .maybeSingle();
      if (folderError) return json({ error: folderError.message }, { status: 500 });
      if (!folder) return json({ error: 'Folder not found.' }, { status: 404 });

      const { data: target, error: targetError } = await client
        .from('files')
        .select('id')
        .eq('project_id', access.project.id)
        .eq('is_folder', true)
        .ilike('name', name)
        .neq('id', folderId)
        .limit(1)
        .maybeSingle();
      if (targetError) return json({ error: targetError.message }, { status: 500 });

      if (target?.id) {
        if (documentKind) {
          const { error: kindError } = await client.from('files').update({ document_kind: documentKind }).eq('id', target.id).eq('is_folder', true);
          if (kindError) return json({ error: kindError.message }, { status: 500 });
        }
        const { error: moveError } = await client
          .from('files')
          .update({ parent_folder_id: target.id })
          .eq('project_id', access.project.id)
          .eq('parent_folder_id', folderId)
          .eq('is_folder', false);
        if (moveError) return json({ error: moveError.message }, { status: 500 });

        const { error: deleteError } = await client.from('files').delete().eq('id', folderId);
        if (deleteError) return json({ error: deleteError.message }, { status: 500 });
        return json({ id: target.id, name, merged: true });
      }

      const updates: { name: string; document_kind?: string } = { name };
      if (documentKind) updates.document_kind = documentKind;

      const { data, error } = await client
        .from('files')
        .update(updates)
        .eq('id', folderId)
        .eq('project_id', access.project.id)
        .eq('is_folder', true)
        .select('id, name')
        .single();
      if (error) return json({ error: error.message }, { status: 500 });
      return json({ id: data.id, name: data.name });
    }

    if (fileIds.length === 0) {
      return json({ error: 'This group has no database files to move.' }, { status: 400 });
    }

    const targetFolderId = await folderIdFor(client, access.project.id, name, access.user.id, documentKind);
    const { error: moveError } = await client
      .from('files')
      .update({ parent_folder_id: targetFolderId })
      .eq('project_id', access.project.id)
      .eq('is_folder', false)
      .is('parent_folder_id', null)
      .in('id', fileIds);

    if (moveError) return json({ error: moveError.message }, { status: 500 });
    return json({ id: targetFolderId, name, moved: fileIds.length });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Group rename failed.' }, { status: 500 });
  }
};
