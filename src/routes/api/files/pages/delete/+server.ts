import { json } from '@sveltejs/kit';
import { deleteObject, isObjectNotFoundError } from '$lib/server/object-storage';
import {
  databaseClientForCurrentUser,
  databaseClientForProjectAccess,
  isProjectAccessError,
  requireProjectAccess
} from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const MAX_DELETE_PAGES = 500;

type PageRow = {
  id: string;
  file_id: string;
  project_id: string;
};

type FileRow = {
  id: string;
  name: string;
  storage_key: string | null;
};

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const pageIds = [...new Set(stringList(body?.pageIds))];
  if (!pageIds.length) return json({ error: 'Select at least one drawing page.' }, { status: 400 });
  if (pageIds.length > MAX_DELETE_PAGES) {
    return json({ error: `Delete up to ${MAX_DELETE_PAGES} pages at a time.` }, { status: 400 });
  }

  let client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: pages, error: pagesError } = await client
    .from('drawing_pages')
    .select('id, file_id, project_id')
    .in('id', pageIds);

  if (pagesError) return json({ error: pagesError.message }, { status: 500 });
  if (!pages?.length) return json({ error: 'No matching drawing pages were found.' }, { status: 404 });

  const projectIds = [...new Set((pages as PageRow[]).map((page) => page.project_id))];
  const { data: projects, error: projectsError } = await client
    .from('projects')
    .select('id, slug')
    .in('id', projectIds);

  if (projectsError) return json({ error: projectsError.message }, { status: 500 });
  const projectById = new Map((projects ?? []).map((project: { id: string; slug: string }) => [project.id, project.slug]));

  for (const projectId of projectIds) {
    const slug = projectById.get(projectId);
    if (!slug) return json({ error: 'Project not found.' }, { status: 404 });
    const access = await requireProjectAccess(event, slug);
    if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
    if (!['superadmin', 'admin'].includes(access.role)) {
      return json({ error: 'Only project admins can delete drawing pages.' }, { status: 403 });
    }
    client = databaseClientForProjectAccess(event, access);
    if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });
  }

  const foundPageIds = (pages as PageRow[]).map((page) => page.id);
  const fileIds = [...new Set((pages as PageRow[]).map((page) => page.file_id))];
  const { error: deleteError } = await client.from('drawing_pages').delete().in('id', foundPageIds);
  if (deleteError) return json({ error: deleteError.message }, { status: 500 });

  let deletedFiles = 0;
  const warnings: string[] = [];
  for (const fileId of fileIds) {
    const { count } = await client
      .from('drawing_pages')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', fileId);
    const remainingPages = count ?? 0;

    if (remainingPages > 0) {
      await client.from('files').update({ page_count: remainingPages }).eq('id', fileId);
      continue;
    }

    const { data: file, error: fileError } = await client
      .from('files')
      .select('id, name, storage_key')
      .eq('id', fileId)
      .eq('is_folder', false)
      .maybeSingle();

    if (fileError) return json({ error: fileError.message }, { status: 500 });
    if (!file) continue;

    const { error: fileDeleteError } = await client.from('files').delete().eq('id', fileId);
    if (fileDeleteError) return json({ error: fileDeleteError.message }, { status: 500 });
    deletedFiles += 1;

    const storageKey = (file as FileRow).storage_key;
    if (storageKey) {
      try {
        await deleteObject(storageKey);
      } catch (error) {
        if (!isObjectNotFoundError(error)) {
          console.error('[files] storage cleanup after drawing page delete failed:', error);
          warnings.push(`${(file as FileRow).name} was removed from the portal, but object storage cleanup failed.`);
        }
      }
    }
  }

  return json({
    ok: true,
    deleted: foundPageIds.length,
    deletedFiles,
    warning: warnings[0]
  });
};
