import { json } from '@sveltejs/kit';
import { analyzeDrawingUpload } from '$lib/server/drawing-ocr';
import { getObject } from '$lib/server/object-storage';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { RequestHandler } from './$types';

function databaseClient(event: Parameters<RequestHandler>[0]) {
  return event.locals.isLocalSuperadmin ? createAdminClient() : event.locals.supabase;
}

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

export const POST: RequestHandler = async (event) => {
  const client = databaseClient(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, project_id, name, storage_key, mime_type')
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

  const object = await getObject(file.storage_key);
  const bytes = await bodyToBytes(object.Body);
  const analysis = await analyzeDrawingUpload(bytes, file.name, contentTypeFor(file.name, file.mime_type));

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

  const { error: deleteError } = await client.from('drawing_pages').delete().eq('file_id', file.id);
  if (deleteError) return json({ error: deleteError.message }, { status: 500 });

  if (analysis.pages.length > 0) {
    const { error: insertError } = await client.from('drawing_pages').insert(
      analysis.pages.map((page) => ({
        project_id: file.project_id,
        file_id: file.id,
        page_number: page.pageNumber,
        name: page.name,
        sheet_number: page.sheetNumber,
        sheet_title: page.sheetTitle,
        revision: page.revision,
        ocr_text: page.text
      }))
    );
    if (insertError) return json({ error: insertError.message }, { status: 500 });
  }

  return json({
    ok: true,
    pageCount: analysis.pageCount,
    ocrStatus: analysis.ocrStatus
  });
};
