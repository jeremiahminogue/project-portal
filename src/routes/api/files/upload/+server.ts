import { json } from '@sveltejs/kit';
import { buildStorageKey, encodeStorageId, putObject } from '$lib/server/object-storage';
import { analyzeDrawingUploadSafely } from '$lib/server/ocr-processing';
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

async function folderIdFor(projectId: string, folderName: string, userId: string, client: App.Locals['supabase']) {
  if (!client || !folderName) return null;

  const { data: existing, error: existingError } = await client
    .from('files')
    .select('id')
    .eq('project_id', projectId)
    .eq('is_folder', true)
    .eq('name', folderName)
    .maybeSingle();

  if (existingError) throw new Error(existingError.message);
  if (existing?.id) return existing.id as string;

  const { data: created, error: createError } = await client
    .from('files')
    .insert({
      project_id: projectId,
      name: folderName,
      is_folder: true,
      uploaded_by: userId
    })
    .select('id')
    .single();

  if (createError) throw new Error(createError.message);
  return created.id as string;
}

export const POST: RequestHandler = async (event) => {
  const form = await event.request.formData();
  const projectSlug = formString(form, 'projectSlug');
  const folderName = formString(form, 'folderName');
  const rawFile = form.get('file');

  if (!projectSlug || !isUploadedFile(rawFile)) {
    return json({ error: 'Choose a project and file before uploading.' }, { status: 400 });
  }
  if (rawFile.size > MAX_BYTES) return json({ error: 'File is too large.' }, { status: 413 });

  const contentType = contentTypeFor(rawFile.name, rawFile.type);
  const storageKey = buildStorageKey(projectSlug, rawFile.name);

  if (!event.locals.supabase) {
    const bytes = new Uint8Array(await rawFile.arrayBuffer());
    await putObject(storageKey, bytes, contentType);
    return json({ id: encodeStorageId(storageKey), name: rawFile.name, storageKey }, { status: 201 });
  }

  const access = await requireProjectAccess(event, projectSlug, { writable: true });
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const bytes = new Uint8Array(await rawFile.arrayBuffer());
  await putObject(storageKey, bytes, contentType);
  const ocr = await analyzeDrawingUploadSafely(bytes, rawFile.name, contentType, folderName);
  const analysis = ocr.analysis;

  try {
    const parentFolderId = await folderIdFor(access.project.id, folderName, access.user.id, event.locals.supabase);
    const { data, error } = await event.locals.supabase
      .from('files')
      .insert({
        project_id: access.project.id,
        parent_folder_id: parentFolderId,
        name: rawFile.name,
        is_folder: false,
        storage_key: storageKey,
        size_bytes: rawFile.size,
        mime_type: contentType,
        document_kind: analysis.documentKind,
        sheet_number: analysis.sheetNumber,
        sheet_title: analysis.sheetTitle,
        revision: analysis.revision,
        page_count: analysis.pageCount,
        ocr_status: analysis.ocrStatus,
        ocr_text: analysis.ocrText,
        uploaded_by: access.user.id,
        tags: []
      })
      .select('id, name, storage_key')
      .single();

    if (error) return json({ error: error.message }, { status: 500 });
    if (analysis.pages.length > 0) {
      const { error: pageError } = await event.locals.supabase.from('drawing_pages').insert(
        analysis.pages.map((page) => ({
          project_id: access.project.id,
          file_id: data.id,
          page_number: page.pageNumber,
          name: page.name,
          sheet_number: page.sheetNumber,
          sheet_title: page.sheetTitle,
          revision: page.revision,
          ocr_text: page.text
        }))
      );
      if (pageError) return json({ error: pageError.message }, { status: 500 });
    }

    return json(
      {
        id: data.id,
        name: data.name,
        storageKey: data.storage_key,
        ocrStatus: analysis.ocrStatus,
        ocrDeferred: !ocr.completed,
        ocrReason: ocr.reason
      },
      { status: ocr.completed ? 201 : 202 }
    );
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Could not save file record.' }, { status: 500 });
  }
};
