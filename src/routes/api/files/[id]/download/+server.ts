import { json } from '@sveltejs/kit';
import {
  contentDisposition,
  decodeStorageId,
  getObject,
  responseBody,
  storageErrorMessage,
  storageErrorStatus
} from '$lib/server/object-storage';
import { databaseClientForCurrentUser, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

function headersFor({
  filename,
  contentType,
  contentLength,
  contentRange,
  download
}: {
  filename: string;
  contentType?: string | null;
  contentLength?: number;
  contentRange?: string;
  download: boolean;
}) {
  const headers = new Headers({
    'Content-Type': contentType || 'application/octet-stream',
    'Content-Disposition': contentDisposition(filename, download ? 'attachment' : 'inline'),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=60'
  });

  if (typeof contentLength === 'number') headers.set('Content-Length', String(contentLength));
  if (contentRange) headers.set('Content-Range', contentRange);
  return headers;
}

function projectSlugFromStorageKey(key: string) {
  const match = /^projects\/([^/]+)\//.exec(key);
  return match?.[1] ?? null;
}

export const GET: RequestHandler = async (event) => {
  const { params, locals, request, url } = event;
  const download = url.searchParams.get('download') === '1';
  const range = request.headers.get('range') ?? undefined;
  const storageKey = decodeStorageId(params.id);

  if (storageKey) {
    if (locals.supabase) {
      const projectSlug = projectSlugFromStorageKey(storageKey);
      if (!projectSlug) return json({ error: 'Invalid storage key.' }, { status: 400 });

      const access = await requireProjectAccess(event, projectSlug);
      if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
    }

    let object: Awaited<ReturnType<typeof getObject>>;
    try {
      object = await getObject(storageKey, range);
    } catch (error) {
      console.error('[files] storage download failed:', error);
      return json({ error: storageErrorMessage(error, 'read this file') }, { status: storageErrorStatus(error) });
    }
    const filename = storageKey.split('/').pop() || 'project-file';
    return new Response(responseBody(object.Body), {
      status: range && object.ContentRange ? 206 : 200,
      headers: headersFor({
        filename,
        contentType: object.ContentType,
        contentLength: object.ContentLength,
        contentRange: object.ContentRange,
        download
      })
    });
  }

  const client = await databaseClientForCurrentUser(event);
  if (!client) {
    return json(
      { error: 'This file needs a storage record before it can be previewed or downloaded.' },
      { status: 404 }
    );
  }

  const { data: file, error } = await client
    .from('files')
    .select('name, storage_key, mime_type, project_id')
    .eq('id', params.id)
    .eq('is_folder', false)
    .maybeSingle();

  if (error) return json({ error: error.message }, { status: 500 });
  if (!file?.storage_key) return json({ error: 'File not found.' }, { status: 404 });

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', file.project_id)
    .maybeSingle();

  if (projectError) return json({ error: projectError.message }, { status: 500 });
  if (!project?.slug) return json({ error: 'Project not found.' }, { status: 404 });

  const access = await requireProjectAccess(event, project.slug);
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject(file.storage_key, range);
  } catch (error) {
    console.error('[files] storage download failed:', error);
    return json({ error: storageErrorMessage(error, 'read this file') }, { status: storageErrorStatus(error) });
  }
  return new Response(responseBody(object.Body), {
    status: range && object.ContentRange ? 206 : 200,
    headers: headersFor({
      filename: file.name,
      contentType: file.mime_type ?? object.ContentType,
      contentLength: object.ContentLength,
      contentRange: object.ContentRange,
      download
    })
  });
};
