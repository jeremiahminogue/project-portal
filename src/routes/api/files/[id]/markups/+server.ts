import { json } from '@sveltejs/kit';
import {
  databaseClientForCurrentUser,
  databaseClientForProjectAccess,
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess
} from '$lib/server/project-access';
import type { RequestEvent } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_MARKUP_JSON_BYTES = 5 * 1024 * 1024;

type LoadedFile =
  | { ok: true; file: { id: string; project_id: string; name: string }; projectSlug: string }
  | { ok: false; response: Response };

function markupPageNumber(event: RequestEvent) {
  const rawPage = event.url.searchParams.get('page');
  if (!rawPage) return 0;
  const page = Number(rawPage);
  return Number.isInteger(page) && page > 0 ? page : -1;
}

async function loadFile(event: RequestEvent): Promise<LoadedFile> {
  const client = await databaseClientForCurrentUser(event);
  if (!client) return { ok: false, response: json({ error: 'Supabase is not configured yet.' }, { status: 400 }) };

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, project_id, name, is_folder')
    .eq('id', event.params.id)
    .eq('is_folder', false)
    .maybeSingle();

  if (fileError) return { ok: false, response: json({ error: fileError.message }, { status: 500 }) };
  if (!file) return { ok: false, response: json({ error: 'File not found.' }, { status: 404 }) };

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', file.project_id)
    .maybeSingle();

  if (projectError) return { ok: false, response: json({ error: projectError.message }, { status: 500 }) };
  if (!project?.slug) return { ok: false, response: json({ error: 'Project not found.' }, { status: 404 }) };

  return { ok: true, file, projectSlug: project.slug as string };
}

export const GET: RequestHandler = async (event) => {
  const loaded = await loadFile(event);
  if (!loaded.ok) return loaded.response;
  const pageNumber = markupPageNumber(event);
  if (pageNumber < 0) return json({ error: 'Use a valid markup page number.' }, { status: 400 });

  const access = await requireProjectAccess(event, loaded.projectSlug);
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ annotations: [] });

  const { data, error } = await client
    .from('file_markups')
    .select('annotations_json, updated_at')
    .eq('file_id', loaded.file.id)
    .eq('page_number', pageNumber)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  return json({
    annotations: Array.isArray(data?.annotations_json) ? data.annotations_json : [],
    updatedAt: data?.updated_at ?? null
  });
};

export const PUT: RequestHandler = async (event) => {
  const loaded = await loadFile(event);
  if (!loaded.ok) return loaded.response;
  const pageNumber = markupPageNumber(event);
  if (pageNumber < 0) return json({ error: 'Use a valid markup page number.' }, { status: 400 });

  const access = await requireProjectAccess(event, loaded.projectSlug, { action: 'save PDF markups' });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  if (!projectRoleCapabilities[access.role].canMarkupFiles) {
    return json({ error: 'Not authorized to save PDF markups.' }, { status: 403 });
  }

  const rawBody = await event.request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_MARKUP_JSON_BYTES) {
    return json({ error: 'Markup layer is too large to save.' }, { status: 413 });
  }

  let body: { annotations?: unknown };
  try {
    body = JSON.parse(rawBody || '{}') as { annotations?: unknown };
  } catch {
    return json({ error: 'Markup payload must be valid JSON.' }, { status: 400 });
  }
  if (!Array.isArray(body.annotations)) {
    return json({ error: 'Markup annotations must be an array.' }, { status: 400 });
  }

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ ok: true, annotations: body.annotations });

  const { data, error } = await client
    .from('file_markups')
    .upsert(
      {
        file_id: loaded.file.id,
        project_id: loaded.file.project_id,
        page_number: pageNumber,
        annotations_json: body.annotations,
        updated_by: access.user.id
      },
      { onConflict: 'file_id,page_number' }
    )
    .select('updated_at')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ ok: true, updatedAt: data.updated_at });
};
