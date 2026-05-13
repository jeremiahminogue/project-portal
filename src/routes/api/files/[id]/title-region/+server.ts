import { json, type RequestEvent } from '@sveltejs/kit';
import { normalizeTitleBlockRegion } from '$lib/server/drawing-ocr';
import {
  databaseClientForCurrentUser,
  databaseClientForProjectAccess,
  isProjectAccessError,
  requireProjectAccess
} from '$lib/server/project-access';
import type { RequestHandler } from './$types';

type LoadedFileProject =
  | {
      ok: true;
      file: { id: string; project_id: string; storage_key: string };
      projectSlug: string;
    }
  | { ok: false; response: Response };

async function loadFileProject(event: RequestEvent): Promise<LoadedFileProject> {
  const client = await databaseClientForCurrentUser(event);
  if (!client) return { ok: false, response: json({ error: 'Supabase is not configured yet.' }, { status: 400 }) };

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, project_id, storage_key, is_folder')
    .eq('id', event.params.id)
    .eq('is_folder', false)
    .maybeSingle();

  if (fileError) return { ok: false, response: json({ error: fileError.message }, { status: 500 }) };
  if (!file?.storage_key) return { ok: false, response: json({ error: 'File not found.' }, { status: 404 }) };

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', file.project_id)
    .maybeSingle();

  if (projectError) return { ok: false, response: json({ error: projectError.message }, { status: 500 }) };
  if (!project?.slug) return { ok: false, response: json({ error: 'Project not found.' }, { status: 404 }) };

  return {
    ok: true,
    file: { id: file.id, project_id: file.project_id, storage_key: file.storage_key },
    projectSlug: project.slug as string
  };
}

export const PUT: RequestHandler = async (event) => {
  const loaded = await loadFileProject(event);
  if (!loaded.ok) return loaded.response;

  const access = await requireProjectAccess(event, loaded.projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const body = await event.request.json().catch(() => null);
  const region = normalizeTitleBlockRegion(body?.region);
  if (!region) return json({ error: 'Select a title area before saving.' }, { status: 400 });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { error } = await client.from('files').update({ title_block_region: region }).eq('id', loaded.file.id);
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true, region });
};

export const DELETE: RequestHandler = async (event) => {
  const loaded = await loadFileProject(event);
  if (!loaded.ok) return loaded.response;

  const access = await requireProjectAccess(event, loaded.projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { error } = await client.from('files').update({ title_block_region: null }).eq('id', loaded.file.id);
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true });
};
