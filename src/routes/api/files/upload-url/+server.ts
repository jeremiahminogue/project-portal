import { json } from '@sveltejs/kit';
import { buildStorageKey, createPresignedUploadUrl, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { issueUploadSession } from '$lib/server/upload-session';
import { normalizeDocumentKind } from '$lib/server/drawing-ocr';
import { isProductionRuntime } from '$lib/server/env';
import type { RequestHandler } from './$types';

const MAX_BYTES = 100 * 1024 * 1024;

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
  const { request, locals } = event;
  const body = await request.json().catch(() => null);
  const projectSlug = body?.projectSlug;
  const filename = body?.filename;
  const sizeBytes = body?.sizeBytes;

  if (typeof projectSlug !== 'string' || typeof filename !== 'string') {
    return json({ error: 'Missing upload fields.' }, { status: 400 });
  }
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return json({ error: 'File size is required.' }, { status: 400 });
  }
  if (sizeBytes > MAX_BYTES) return json({ error: 'File is too large.' }, { status: 413 });
  const contentType = contentTypeFor(filename, typeof body?.contentType === 'string' ? body.contentType : undefined);
  const documentKind = normalizeDocumentKind(body?.documentKind) ?? 'file';

  if (!locals.supabase) {
    if (isProductionRuntime()) return json({ error: 'Portal authentication is not configured.' }, { status: 503 });
    const key = buildStorageKey(projectSlug, filename);
    return json(await createPresignedUploadUrl(key, contentType));
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const key = buildStorageKey(projectSlug, filename);
  try {
    const upload = await createPresignedUploadUrl(key, contentType);
    return json({
      ...upload,
      uploadToken: issueUploadSession({
        projectSlug,
        key,
        name: filename,
        sizeBytes,
        mimeType: contentType,
        documentKind,
        userId: access.user.id
      })
    });
  } catch (error) {
    console.error('[files] presigned upload failed:', error);
    return json({ error: storageErrorMessage(error, 'prepare the upload') }, { status: storageErrorStatus(error) });
  }
};
