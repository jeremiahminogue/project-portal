import { json } from '@sveltejs/kit';
import { PDFDocument } from 'pdf-lib';
import { parseSheetName } from '$lib/server/drawing-ocr';
import {
  getObject,
  putObject,
  responseBody,
  storageErrorMessage,
  storageErrorStatus
} from '$lib/server/object-storage';
import {
  databaseClientForCurrentUser,
  databaseClientForProjectAccess,
  isProjectAccessError,
  requireProjectAccess
} from '$lib/server/project-access';
import type { RequestHandler } from './$types';

function cleanName(value: unknown) {
  return String(value ?? '')
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .slice(0, 200);
}

function cleanSheetNumber(value: unknown) {
  const cleaned = cleanName(value).toUpperCase();
  return cleaned ? cleaned.slice(0, 32) : null;
}

function cleanRevision(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const cleaned = value
    .trim()
    .replace(/[\\/]+/g, '-')
    .replace(/\s+/g, ' ')
    .toUpperCase()
    .slice(0, 16);
  return cleaned || null;
}

function pageName(sheetNumber: string | null, sheetTitle: string | null, fallback: string) {
  if (sheetNumber && sheetTitle) return `${sheetNumber} - ${sheetTitle}`;
  return sheetNumber ?? sheetTitle ?? fallback;
}

function pdfBytesBody(value: unknown) {
  return new Response(responseBody(value as Parameters<typeof responseBody>[0])).arrayBuffer();
}

function nextRevision(value: string | null | undefined) {
  const cleaned = value?.trim() ?? '';
  const numeric = /^\d+$/.test(cleaned) ? Number.parseInt(cleaned, 10) : 0;
  return String(numeric >= 1 ? numeric + 1 : 1);
}

async function replacePdfPage(sourceBytes: Uint8Array, replacementBytes: Uint8Array, pageNumber: number) {
  const source = await PDFDocument.load(sourceBytes, { ignoreEncryption: true });
  const replacement = await PDFDocument.load(replacementBytes, { ignoreEncryption: true });
  const sourcePageCount = source.getPageCount();
  const replacementPageCount = replacement.getPageCount();
  const targetIndex = pageNumber - 1;
  if (targetIndex < 0 || targetIndex >= sourcePageCount) throw new Error(`Page ${pageNumber} is not in this PDF.`);
  if (replacementPageCount < 1) throw new Error('The replacement PDF has no pages.');

  const output = await PDFDocument.create();
  for (let index = 0; index < sourcePageCount; index += 1) {
    const sourceDoc = index === targetIndex ? replacement : source;
    const sourceIndex = index === targetIndex ? 0 : index;
    const [copied] = await output.copyPages(sourceDoc, [sourceIndex]);
    output.addPage(copied);
  }

  return new Uint8Array(await output.save());
}

export const PATCH: RequestHandler = async (event) => {
  let client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: page, error: pageError } = await client
    .from('drawing_pages')
    .select('id, file_id, project_id, page_number, name, revision')
    .eq('id', event.params.pageId)
    .eq('file_id', event.params.id)
    .maybeSingle();

  if (pageError) return json({ error: pageError.message }, { status: 500 });
  if (!page) return json({ error: 'Drawing page not found.' }, { status: 404 });

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', page.project_id)
    .maybeSingle();

  if (projectError) return json({ error: projectError.message }, { status: 500 });
  if (!project?.slug) return json({ error: 'Project not found.' }, { status: 404 });

  const access = await requireProjectAccess(event, project.slug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const body = await event.request.json().catch(() => null);
  const requestedName = cleanName(body?.name);
  const requestedSheetNumber = cleanSheetNumber(body?.sheetNumber);
  const requestedSheetTitle = cleanName(body?.sheetTitle) || null;
  const requestedRevision = cleanRevision(body?.revision);
  const parsed = parseSheetName(requestedName || `${requestedSheetNumber ?? ''} ${requestedSheetTitle ?? ''}`.trim());
  const sheetNumber = requestedSheetNumber ?? parsed.sheetNumber;
  const sheetTitle = requestedSheetTitle ?? parsed.sheetTitle;
  const revision = requestedRevision !== undefined ? requestedRevision : (parsed.revision ?? page.revision);
  const name = requestedName || pageName(sheetNumber, sheetTitle, page.name);
  if (!name) return json({ error: 'Page name is required.' }, { status: 400 });

  const { data, error } = await client
    .from('drawing_pages')
    .update({
      name,
      sheet_number: sheetNumber,
      sheet_title: sheetTitle ?? name,
      revision
    })
    .eq('id', event.params.pageId)
    .select('id, name, sheet_number, sheet_title, revision')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });

  if (page.page_number === 1) {
    await client
      .from('files')
      .update({
        sheet_number: data.sheet_number,
        sheet_title: data.sheet_title,
        revision: data.revision
      })
      .eq('id', page.file_id);
  }

  return json({
    id: data.id,
    name: data.name,
    sheetNumber: data.sheet_number,
    sheetTitle: data.sheet_title,
    revision: data.revision
  });
};

export const PUT: RequestHandler = async (event) => {
  let client = await databaseClientForCurrentUser(event);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: page, error: pageError } = await client
    .from('drawing_pages')
    .select('id, file_id, project_id, page_number, name, sheet_number, sheet_title, revision')
    .eq('id', event.params.pageId)
    .eq('file_id', event.params.id)
    .maybeSingle();

  if (pageError) return json({ error: pageError.message }, { status: 500 });
  if (!page) return json({ error: 'Drawing page not found.' }, { status: 404 });

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('slug')
    .eq('id', page.project_id)
    .maybeSingle();

  if (projectError) return json({ error: projectError.message }, { status: 500 });
  if (!project?.slug) return json({ error: 'Project not found.' }, { status: 404 });

  const access = await requireProjectAccess(event, project.slug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });
  client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const form = await event.request.formData().catch(() => null);
  const replacementFile = form?.get('file');
  if (!(replacementFile instanceof File) || replacementFile.size <= 0) {
    return json({ error: 'Choose a PDF page to replace this sheet.' }, { status: 400 });
  }
  if (!/pdf/i.test(replacementFile.type) && !/\.pdf$/i.test(replacementFile.name)) {
    return json({ error: 'Replacement sheets must be uploaded as PDF files.' }, { status: 400 });
  }

  const { data: file, error: fileError } = await client
    .from('files')
    .select('id, name, storage_key, mime_type, sheet_number, sheet_title, revision')
    .eq('id', page.file_id)
    .eq('is_folder', false)
    .maybeSingle();

  if (fileError) return json({ error: fileError.message }, { status: 500 });
  if (!file?.storage_key) return json({ error: 'Drawing set file not found.' }, { status: 404 });
  if (!/pdf/i.test(file.mime_type ?? '') && !/\.pdf$/i.test(file.name)) {
    return json({ error: 'Only PDF drawing sets can replace individual pages.' }, { status: 400 });
  }

  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject(file.storage_key);
  } catch (error) {
    console.error('[files] replacement read failed:', error);
    return json({ error: storageErrorMessage(error, 'read this drawing set') }, { status: storageErrorStatus(error) });
  }

  let updatedBytes: Uint8Array;
  try {
    const sourceBytes = new Uint8Array(await pdfBytesBody(object.Body));
    const replacementBytes = new Uint8Array(await replacementFile.arrayBuffer());
    updatedBytes = await replacePdfPage(sourceBytes, replacementBytes, page.page_number);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The replacement PDF could not be read.';
    const status = message.includes('not in this PDF') ? 404 : 400;
    return json({ error: message }, { status });
  }

  try {
    await putObject(file.storage_key, updatedBytes, 'application/pdf');
  } catch (error) {
    console.error('[files] replacement write failed:', error);
    return json({ error: storageErrorMessage(error, 'save the replacement sheet') }, { status: storageErrorStatus(error) });
  }

  const revision = nextRevision(page.revision);
  const { data, error } = await client
    .from('drawing_pages')
    .update({
      revision,
      ocr_text: null
    })
    .eq('id', page.id)
    .select('id, name, sheet_number, sheet_title, revision')
    .single();

  if (error) return json({ error: error.message }, { status: 500 });

  const fileUpdates: Record<string, string | null> = { updated_at: new Date().toISOString() };
  if (page.page_number === 1) {
    fileUpdates.sheet_number = data.sheet_number;
    fileUpdates.sheet_title = data.sheet_title;
    fileUpdates.revision = data.revision;
  }
  const { error: updateFileError } = await client.from('files').update(fileUpdates).eq('id', file.id);
  if (updateFileError) return json({ error: updateFileError.message }, { status: 500 });

  return json({
    id: data.id,
    name: data.name,
    sheetNumber: data.sheet_number,
    sheetTitle: data.sheet_title,
    revision: data.revision
  });
};
