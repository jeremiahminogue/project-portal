import { json } from '@sveltejs/kit';
import { getObject, responseBody, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { databaseClientForCurrentUser, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

async function bodyToBytes(body: unknown) {
  if (!body) return new Uint8Array();
  if (body instanceof Uint8Array) return body;
  if (body instanceof ArrayBuffer) return new Uint8Array(body);

  const chunks: Uint8Array[] = [];
  const iterable = body as AsyncIterable<Uint8Array>;
  if (typeof iterable[Symbol.asyncIterator] === 'function') {
    for await (const chunk of iterable) chunks.push(chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk));
  } else {
    const response = new Response(responseBody(body));
    return new Uint8Array(await response.arrayBuffer());
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

function pageNumber(value: string | null) {
  const page = Number(value ?? '1');
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function byteBody(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

export const GET: RequestHandler = async (event) => {
  const client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, name, project_id, storage_key, mime_type')
    .eq('id', event.params.id)
    .eq('is_folder', false)
    .maybeSingle();

  if (fileError) return json({ error: fileError.message }, { status: 500 });
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
  if (!/pdf/i.test(file.mime_type ?? '') && !/\.pdf$/i.test(file.name)) return json({ error: 'Only PDF pages can be rendered.' }, { status: 400 });

  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject(file.storage_key);
  } catch (error) {
    console.error('[files] page image read failed:', error);
    return json({ error: storageErrorMessage(error, 'render this page') }, { status: storageErrorStatus(error) });
  }

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const canvasKit = await import('@napi-rs/canvas');
    globalThis.DOMMatrix ??= canvasKit.DOMMatrix as typeof DOMMatrix;
    globalThis.DOMPoint ??= canvasKit.DOMPoint as typeof DOMPoint;
    globalThis.DOMRect ??= canvasKit.DOMRect as typeof DOMRect;
    globalThis.ImageData ??= canvasKit.ImageData as unknown as typeof ImageData;

    const bytes = await bodyToBytes(object.Body);
    const loadingTask = pdfjs.getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    try {
      const requestedPage = pageNumber(event.url.searchParams.get('page'));
      if (requestedPage > pdf.numPages) return json({ error: `Page ${requestedPage} is not in this PDF.` }, { status: 404 });
      const page = await pdf.getPage(requestedPage);
      const viewport = page.getViewport({ scale: 1.4 });
      const canvas = canvasKit.createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      const canvasContext = canvas.getContext('2d');
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
        viewport
      }).promise;
      const png = new Uint8Array(canvas.toBuffer('image/png'));
      return new Response(byteBody(png), {
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'private, max-age=60'
        }
      });
    } finally {
      await pdf.destroy().catch(() => undefined);
    }
  } catch (error) {
    console.error('[files] page image render failed:', error);
    const message = error instanceof Error ? error.message : 'Could not render this PDF page.';
    return json({ error: message }, { status: 500 });
  }
};
