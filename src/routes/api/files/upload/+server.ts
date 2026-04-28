import { json } from '@sveltejs/kit';
import { buildStorageKey, encodeStorageId, putObject, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { registerUploadedFile } from '$lib/server/file-ingest';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const MAX_BYTES = 100 * 1024 * 1024;

type UploadedFile = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

function isUploadedFile(value: unknown): value is UploadedFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<UploadedFile>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function contentTypeFor(filename: string, contentType?: string) {
  if (contentType) return contentType;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData();
  const projectSlug = formString(form, 'projectSlug');
  const folderName = formString(form, 'folderName');
  const documentKind = formString(form, 'documentKind');
  const rawFile = form.get('file');

  if (!projectSlug || !isUploadedFile(rawFile)) {
    return json({ error: 'Choose a project and file before uploading.' }, { status: 400 });
  }
  if (rawFile.size > MAX_BYTES) return json({ error: 'File is too large.' }, { status: 413 });

  const contentType = contentTypeFor(rawFile.name, rawFile.type);
  const storageKey = buildStorageKey(projectSlug, rawFile.name);
  const bytes = new Uint8Array(await rawFile.arrayBuffer());

  if (!event.locals.supabase) {
    try {
      await putObject(storageKey, bytes, contentType);
    } catch (error) {
      console.error('[files] direct upload failed:', error);
      return json({ error: storageErrorMessage(error, 'upload this file') }, { status: storageErrorStatus(error) });
    }
    return json({ id: encodeStorageId(storageKey), name: rawFile.name, storageKey }, { status: 201 });
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  try {
    await putObject(storageKey, bytes, contentType);
  } catch (error) {
    console.error('[files] direct upload failed:', error);
    return json({ error: storageErrorMessage(error, 'upload this file') }, { status: storageErrorStatus(error) });
  }
  try {
    const result = await registerUploadedFile({
      event,
      access,
      storageKey,
      name: rawFile.name,
      sizeBytes: rawFile.size,
      mimeType: contentType,
      folderName,
      documentKind,
      bytes
    });
    return json(result, { status: result.ocrDeferred ? 202 : 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save file record.' }, { status: 500 });
  }
};
