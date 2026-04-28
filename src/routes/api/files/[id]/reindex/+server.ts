import { json } from '@sveltejs/kit';
import { getObject, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { analyzeDrawingUploadSafely } from '$lib/server/ocr-processing';
import { classifyDocument, normalizeDocumentKind, type DrawingPageAnalysis } from '$lib/server/drawing-ocr';
import {
  databaseClientForCurrentUser,
  databaseClientForProjectAccess,
  isProjectAccessError,
  requireProjectAccess
} from '$lib/server/project-access';
import type { RequestHandler } from './$types';

async function bodyToBytes(body: unknown) {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);

  const byteArrayBody = body as { transformToByteArray?: () => Promise<Uint8Array> };
  if (typeof byteArrayBody.transformToByteArray === 'function') {
    return new Uint8Array(await byteArrayBody.transformToByteArray());
  }

  const chunks: Uint8Array[] = [];
  const iterable = body as AsyncIterable<Uint8Array>;
  if (typeof iterable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of iterable) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  }

  const size = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function contentTypeFor(filename: string, contentType?: string | null) {
  if (contentType) return contentType;
  return /\.pdf$/i.test(filename) ? 'application/pdf' : 'application/octet-stream';
}

async function replaceDrawingPages(
  client: NonNullable<App.Locals['supabase']>,
  projectId: string,
  fileId: string,
  pages: DrawingPageAnalysis[]
) {
  const { error: deleteError } = await client.from('drawing_pages').delete().eq('file_id', fileId);
  if (deleteError) return deleteError.message;

  if (pages.length === 0) return null;

  const { error: insertError } = await client.from('drawing_pages').insert(
    pages.map((page) => ({
      project_id: projectId,
      file_id: fileId,
      page_number: page.pageNumber,
      name: page.name,
      sheet_number: page.sheetNumber,
      sheet_title: page.sheetTitle,
      revision: page.revision,
      ocr_text: page.text
    }))
  );
  return insertError?.message ?? null;
}

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => ({}));
  const force = Boolean((body as { force?: unknown })?.force);
  let client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, project_id, name, storage_key, mime_type, document_kind, parent_folder_id, page_count')
    .eq('id', event.params.id)
    .eq('is_folder', false)
    .maybeSingle();

  if (fileError) return json({ error: fileError.message }, { status: 500 });
  if (!file?.storage_key) return json({ error: 'File not found.' }, { status: 404 });

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id, slug')
    .eq('id', file.project_id)
    .maybeSingle();

  if (projectError) return json({ error: projectError.message }, { status: 500 });
  if (!project?.slug) return json({ error: 'Project not found.' }, { status: 404 });

  const access = await requireProjectAccess(event, project.slug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  let folderName = '';
  if (file.parent_folder_id) {
    const { data: folder, error: folderError } = await client
      .from('files')
      .select('name')
      .eq('id', file.parent_folder_id)
      .eq('is_folder', true)
      .maybeSingle();
    if (folderError) return json({ error: folderError.message }, { status: 500 });
    folderName = folder?.name ?? '';
  }

  await client.from('files').update({ ocr_status: 'pending' }).eq('id', file.id);

  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject(file.storage_key);
  } catch (error) {
    console.error('[files] storage reindex read failed:', error);
    await client.from('files').update({ ocr_status: 'failed' }).eq('id', file.id);
    return json({ error: storageErrorMessage(error, 'read this file for OCR') }, { status: storageErrorStatus(error) });
  }
  const bytes = await bodyToBytes(object.Body);
  const contentType = contentTypeFor(file.name, file.mime_type);
  const storedDocumentKind = normalizeDocumentKind(file.document_kind);
  const contextualDocumentKind = classifyDocument(file.name, contentType, folderName);
  const documentKind = storedDocumentKind === 'drawing' && contextualDocumentKind !== 'drawing' ? contextualDocumentKind : storedDocumentKind;
  const ocr = await analyzeDrawingUploadSafely(bytes, file.name, contentType, folderName, documentKind, { force });
  const analysis = ocr.analysis;

  if (!ocr.completed) {
    const shouldReplaceDeferredPages = analysis.documentKind === 'drawing' && (file.page_count ?? 1) <= 1 && analysis.pages.length > 1;
    const { error: statusError } = await client
      .from('files')
      .update({
        ocr_status: analysis.ocrStatus,
        ...(shouldReplaceDeferredPages ? { page_count: analysis.pageCount } : {})
      })
      .eq('id', file.id);
    if (statusError) return json({ error: statusError.message }, { status: 500 });

    if (shouldReplaceDeferredPages) {
      const pageError = await replaceDrawingPages(client, file.project_id, file.id, analysis.pages);
      if (pageError) return json({ error: pageError }, { status: 500 });
    }

    return json({
      ok: true,
      pageCount: shouldReplaceDeferredPages ? analysis.pageCount : file.page_count,
      ocrStatus: analysis.ocrStatus,
      ocrDeferred: true,
      ocrReason: ocr.reason
    }, { status: 202 });
  }

  const { error: updateError } = await client
    .from('files')
    .update({
      document_kind: analysis.documentKind,
      sheet_number: analysis.sheetNumber,
      sheet_title: analysis.sheetTitle,
      revision: analysis.revision,
      page_count: analysis.pageCount,
      ocr_status: analysis.ocrStatus,
      ocr_text: analysis.ocrText
    })
    .eq('id', file.id);

  if (updateError) return json({ error: updateError.message }, { status: 500 });

  const pageError = await replaceDrawingPages(client, file.project_id, file.id, analysis.documentKind === 'drawing' ? analysis.pages : []);
  if (pageError) return json({ error: pageError }, { status: 500 });

  return json({
    ok: true,
    pageCount: analysis.pageCount,
    ocrStatus: analysis.ocrStatus,
    ocrDeferred: !ocr.completed,
    ocrReason: ocr.reason
  }, { status: ocr.completed ? 200 : 202 });
};
