import { json } from '@sveltejs/kit';
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

  for (const fileId of fileIds) {
    const { count } = await client
      .from('drawing_pages')
      .select('id', { count: 'exact', head: true })
      .eq('file_id', fileId);
    await client.from('files').update({ page_count: count ?? 0 }).eq('id', fileId);
  }

  return json({ ok: true, deleted: foundPageIds.length });
};
