import { json } from '@sveltejs/kit';
import { decodeStorageId, deleteObject } from '$lib/server/object-storage';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { RequestEvent } from './$types';
import type { RequestHandler } from './$types';

type FileRow = {
  id: string;
  project_id: string;
  parent_folder_id: string | null;
  name: string;
  is_folder: boolean;
  storage_key: string | null;
};

type LoadedFile =
  | { ok: true; file: FileRow; projectSlug: string }
  | { ok: false; response: Response };

function projectSlugFromStorageKey(key: string) {
  const match = /^projects\/([^/]+)\//.exec(key);
  return match?.[1] ?? null;
}

function cleanName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function databaseClient(event: RequestEvent) {
  return event.locals.isLocalSuperadmin ? createAdminClient() : event.locals.supabase;
}

async function loadDatabaseFile(event: RequestEvent, id: string): Promise<LoadedFile> {
  const client = databaseClient(event);
  if (!client) return { ok: false, response: json({ error: 'Supabase is not configured yet.' }, { status: 400 }) };

  const { data: file, error } = await client
    .from('files')
    .select('id, project_id, parent_folder_id, name, is_folder, storage_key')
    .eq('id', id)
    .maybeSingle();

  if (error) return { ok: false, response: json({ error: error.message }, { status: 500 }) };
  if (!file) return { ok: false, response: json({ error: 'File not found.' }, { status: 404 }) };

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', file.project_id)
    .maybeSingle();

  if (projectError) return { ok: false, response: json({ error: projectError.message }, { status: 500 }) };
  if (!project?.slug) return { ok: false, response: json({ error: 'Project not found.' }, { status: 404 }) };

  return { ok: true, file: file as FileRow, projectSlug: project.slug as string };
}

export const PATCH: RequestHandler = async (event) => {
  const storageKey = decodeStorageId(event.params.id);
  if (storageKey) {
    return json({ error: 'Storage-only files must be added to the register before they can be renamed.' }, { status: 400 });
  }

  const loaded = await loadDatabaseFile(event, event.params.id);
  if (!loaded.ok) return loaded.response;

  const access = await requireProjectAccess(event, loaded.projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const body = await event.request.json().catch(() => null);
  const name = cleanName(body?.name);
  if (!name) return json({ error: 'Name is required.' }, { status: 400 });

  const client = databaseClient(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data, error } = await client
    .from('files')
    .update({ name })
    .eq('id', loaded.file.id)
    .select('id, name')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });
  return json({ id: data.id, name: data.name });
};

export const DELETE: RequestHandler = async (event) => {
  const storageKey = decodeStorageId(event.params.id);

  if (storageKey) {
    const projectSlug = projectSlugFromStorageKey(storageKey);
    if (!projectSlug) return json({ error: 'Invalid storage key.' }, { status: 400 });

    const access = await requireProjectAccess(event, projectSlug);
    if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
    if (!['superadmin', 'admin'].includes(access.role)) {
      return json({ error: 'Only project admins can delete files.' }, { status: 403 });
    }

    await deleteObject(storageKey);
    return json({ ok: true });
  }

  const loaded = await loadDatabaseFile(event, event.params.id);
  if (!loaded.ok) return loaded.response;

  const access = await requireProjectAccess(event, loaded.projectSlug);
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  if (!['superadmin', 'admin'].includes(access.role)) {
    return json({ error: 'Only project admins can delete files.' }, { status: 403 });
  }

  if (loaded.file.is_folder) {
    const client = databaseClient(event);
    if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });
    const { count, error: countError } = await client
      .from('files')
      .select('id', { count: 'exact', head: true })
      .eq('parent_folder_id', loaded.file.id);

    if (countError) return json({ error: countError.message }, { status: 500 });
    if ((count ?? 0) > 0) {
      return json({ error: 'Move or delete the files inside this folder first.' }, { status: 409 });
    }
  }

  if (loaded.file.storage_key) await deleteObject(loaded.file.storage_key);

  const client = databaseClient(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });
  const { error } = await client.from('files').delete().eq('id', loaded.file.id);
  if (error) return json({ error: error.message }, { status: 500 });

  return json({ ok: true });
};
