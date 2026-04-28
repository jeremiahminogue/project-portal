import type { RequestEvent } from '@sveltejs/kit';
import { basicDrawingAnalysis } from './drawing-ocr';
import { analyzeDrawingUploadSafely, shouldAnalyzeInline, shouldIndexPdfPages } from './ocr-processing';
import { getObject, responseBody } from './object-storage';
import { databaseClientForProjectAccess, type ProjectAccess } from './project-access';

type RegisterUploadedFileInput = {
  event: RequestEvent;
  access: ProjectAccess;
  storageKey: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  folderName?: string;
  tags?: unknown;
  bytes?: Uint8Array;
};

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

async function objectBytes(storageKey: string) {
  const object = await getObject(storageKey);
  const response = new Response(responseBody(object.Body));
  return new Uint8Array(await response.arrayBuffer());
}

export async function registerUploadedFile({
  event,
  access,
  storageKey,
  name,
  sizeBytes,
  mimeType,
  folderName = '',
  tags = [],
  bytes
}: RegisterUploadedFileInput) {
  const client = databaseClientForProjectAccess(event, access);
  if (!client) throw new Error('Supabase is not configured yet.');

  const shouldLoadForIndexing = shouldAnalyzeInline(sizeBytes) || shouldIndexPdfPages(sizeBytes, name, mimeType);
  const analysisBytes = bytes ?? (shouldLoadForIndexing ? await objectBytes(storageKey) : undefined);
  const ocr = analysisBytes
    ? await analyzeDrawingUploadSafely(analysisBytes, name, mimeType, folderName)
    : {
        analysis: basicDrawingAnalysis(name, mimeType, folderName, 'pending'),
        completed: false,
        reason: 'deferred_size' as const
      };
  const analysis = ocr.analysis;
  const parentFolderId = await folderIdFor(access.project.id, folderName, access.user.id, client);

  const { data, error } = await client
    .from('files')
    .insert({
      project_id: access.project.id,
      parent_folder_id: parentFolderId,
      name,
      is_folder: false,
      storage_key: storageKey,
      size_bytes: sizeBytes,
      mime_type: mimeType,
      document_kind: analysis.documentKind,
      sheet_number: analysis.sheetNumber,
      sheet_title: analysis.sheetTitle,
      revision: analysis.revision,
      page_count: analysis.pageCount,
      ocr_status: analysis.ocrStatus,
      ocr_text: analysis.ocrText,
      uploaded_by: access.user.id,
      tags: Array.isArray(tags) ? tags : []
    })
    .select('id, name, storage_key')
    .single();

  if (error) throw new Error(error.message);

  let warning: string | undefined;
  if (analysis.pages.length > 0) {
    const { error: pageError } = await client.from('drawing_pages').insert(
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
    if (pageError) {
      console.error('[files] drawing page insert failed after upload:', pageError);
      warning = 'File uploaded, but drawing page indexing needs to be re-run.';
      await client.from('files').update({ ocr_status: 'partial' }).eq('id', data.id);
    }
  }

  return {
    id: data.id as string,
    name: data.name as string,
    storageKey: data.storage_key as string,
    ocrStatus: warning ? 'partial' : analysis.ocrStatus,
    ocrDeferred: !ocr.completed,
    ocrReason: ocr.reason,
    warning
  };
}
