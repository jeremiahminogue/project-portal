import { json } from '@sveltejs/kit';
import { deleteObject, encodeStorageId, headObject, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { registerUploadedFile } from '$lib/server/file-ingest';
import { normalizeDocumentKind } from '$lib/server/drawing-ocr';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { isProjectStorageKey, verifyUploadSession } from '$lib/server/upload-session';
import type { RequestHandler } from './$types';

const MAX_BYTES = 100 * 1024 * 1024;

export const POST: RequestHandler = async (event) => {
  const { request, locals } = event;
  const body = await request.json().catch(() => null);

  const { projectSlug, key, name, sizeBytes, mimeType, folderName, documentKind, tags, uploadToken } = body ?? {};
  const requestedDocumentKind = normalizeDocumentKind(documentKind) ?? 'file';
  if (
    typeof projectSlug !== 'string' ||
    typeof key !== 'string' ||
    typeof name !== 'string' ||
    typeof mimeType !== 'string'
  ) {
    return json({ error: 'Missing file fields.' }, { status: 400 });
  }
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0 || sizeBytes > MAX_BYTES) {
    return json({ error: 'Invalid file size.' }, { status: 400 });
  }
  if (!isProjectStorageKey(projectSlug, key)) {
    return json({ error: 'Invalid storage key for this project.' }, { status: 400 });
  }

  if (!locals.supabase) {
    return json({ id: encodeStorageId(key), name, storageKey: key }, { status: 201 });
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  if (typeof uploadToken !== 'string') return json({ error: 'Upload authorization is missing.' }, { status: 400 });
  let session: ReturnType<typeof verifyUploadSession>;
  try {
    session = verifyUploadSession(uploadToken);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Upload authorization is invalid.' }, { status: 400 });
  }

  if (
    session.projectSlug !== projectSlug ||
    session.key !== key ||
    session.name !== name ||
    session.sizeBytes !== sizeBytes ||
    session.mimeType !== mimeType ||
    session.documentKind !== requestedDocumentKind ||
    session.userId !== access.user.id
  ) {
    return json({ error: 'Upload metadata does not match the issued upload authorization.' }, { status: 400 });
  }

  try {
    const object = await headObject(key);
    const storedType = object.ContentType?.split(';')[0].trim().toLowerCase();
    const expectedType = mimeType.split(';')[0].trim().toLowerCase();
    if (object.ContentLength !== sizeBytes || storedType !== expectedType) {
      await deleteObject(key).catch(() => undefined);
      return json({ error: 'Uploaded object metadata did not match the file that was authorized.' }, { status: 400 });
    }
  } catch (error) {
    console.error('[files] uploaded object verification failed:', error);
    return json({ error: storageErrorMessage(error, 'verify the upload') }, { status: storageErrorStatus(error) });
  }

  try {
    const result = await registerUploadedFile({
      event,
      access,
      storageKey: key,
      name,
      sizeBytes,
      mimeType,
      folderName: typeof folderName === 'string' ? folderName : '',
      documentKind: requestedDocumentKind,
      tags
    });
    return json(result, { status: result.ocrDeferred ? 202 : 201 });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save file record.' }, { status: 500 });
  }
};
