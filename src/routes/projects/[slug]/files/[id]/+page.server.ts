import { error } from '@sveltejs/kit';
import { contentDisposition, decodeStorageId } from '$lib/server/object-storage';
import { normalizeTitleBlockRegion } from '$lib/server/drawing-ocr';
import {
  databaseClientForProjectAccess,
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess
} from '$lib/server/project-access';
import { isMissingFileTitleBlockRegionError } from '$lib/server/schema-compat';
import type { PageServerLoad } from './$types';

function filenameFromStorageKey(key: string) {
  return key.split('/').pop()?.replace(/^[a-f0-9]{8}-/i, '') || 'project-file.pdf';
}

function contentTypeFromName(name: string) {
  if (/\.pdf$/i.test(name)) return 'application/pdf';
  if (/\.(png|webp|gif)$/i.test(name)) return `image/${name.split('.').pop()?.toLowerCase()}`;
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.docx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.xlsx$/i.test(name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export const load: PageServerLoad = async (event) => {
  const access = await requireProjectAccess(event, event.params.slug);
  if (isProjectAccessError(access)) throw error(access.status, access.message);
  const fileAccess = {
    role: access.role,
    canModify: projectRoleCapabilities[access.role].canEditFiles,
    canMarkup: projectRoleCapabilities[access.role].canMarkupFiles,
    canDownload: projectRoleCapabilities[access.role].canDownloadFiles
  };

  const storageKey = decodeStorageId(event.params.id);
  const downloadSrc = `/api/files/${encodeURIComponent(event.params.id)}/download?inline=1`;
  const downloadUrl = `/api/files/${encodeURIComponent(event.params.id)}/download?download=1`;
  const backUrl = `/projects/${event.params.slug}/files`;

  if (storageKey) {
    const name = filenameFromStorageKey(storageKey);
    return {
      file: {
        id: event.params.id,
        name,
        sheetNumber: null,
        sheetTitle: name.replace(/\.[^.]+$/, ''),
        revision: null,
        mimeType: contentTypeFromName(name),
        titleBlockRegion: null,
        pages: []
      },
      downloadSrc,
      downloadUrl,
      backUrl,
      markupsUrl: '',
      fileAccess,
      contentDisposition: contentDisposition(name, 'inline')
    };
  }

  const client = databaseClientForProjectAccess(event, access);
  if (!client) throw error(400, 'Supabase is not configured yet.');
  const fileClient = client;
  const projectId = access.project.id;

  type ViewerFileRow = {
    id: string;
    name: string;
    project_id: string;
    mime_type: string | null;
    storage_key: string | null;
    sheet_number: string | null;
    sheet_title: string | null;
    revision: string | null;
    page_count: number | null;
    title_block_region?: unknown;
  };

  async function loadFile(includeTitleBlockRegion: boolean) {
    const selectColumns = includeTitleBlockRegion
      ? 'id, name, project_id, mime_type, storage_key, sheet_number, sheet_title, revision, page_count, title_block_region'
      : 'id, name, project_id, mime_type, storage_key, sheet_number, sheet_title, revision, page_count';
    return fileClient
      .from('files')
      .select(selectColumns as '*')
      .eq('id', event.params.id)
      .eq('project_id', projectId)
      .eq('is_folder', false)
      .maybeSingle();
  }

  let fileResult = await loadFile(true);
  if (isMissingFileTitleBlockRegionError(fileResult.error)) fileResult = await loadFile(false);
  const file = fileResult.data as ViewerFileRow | null;
  const fileError = fileResult.error;

  if (fileError) throw error(500, fileError.message);
  if (!file?.storage_key) throw error(404, 'File not found.');

  const { data: pages, error: pagesError } = await client
    .from('drawing_pages')
    .select('id, page_number, name, sheet_number, sheet_title, revision')
    .eq('file_id', file.id)
    .order('page_number', { ascending: true });

  if (pagesError) throw error(500, pagesError.message);

  return {
    file: {
      id: file.id,
      name: file.name,
      sheetNumber: file.sheet_number,
      sheetTitle: file.sheet_title,
      revision: file.revision,
      mimeType: file.mime_type,
      pageCount: file.page_count,
      titleBlockRegion: normalizeTitleBlockRegion('title_block_region' in file ? file.title_block_region : null),
      pages: (pages ?? []).map((page) => ({
        id: page.id,
        pageNumber: page.page_number,
        name: page.name,
        sheetNumber: page.sheet_number,
        sheetTitle: page.sheet_title,
        revision: page.revision
      }))
    },
    downloadSrc,
    downloadUrl,
    backUrl,
    markupsUrl: `/api/files/${encodeURIComponent(file.id)}/markups`,
    fileAccess,
    contentDisposition: contentDisposition(file.name, 'inline')
  };
};
