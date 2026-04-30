import { bytesToSize } from '$lib/utils';

const PORTAL_FALLBACK_LIMIT_BYTES = 4 * 1024 * 1024;

export type ProjectUploadStage = 'prepare' | 'network' | 'storage' | 'register' | 'server';

export type UploadedProjectFile = {
  id: string;
  name: string;
  storageKey?: string;
  sizeBytes: number;
  sizeLabel: string;
  mimeType: string;
  fileType: 'image' | 'pdf' | 'docx' | 'xlsx' | 'file';
  path: string;
  warning?: string;
};

export type UploadProjectFileInput = {
  projectSlug: string;
  file: File;
  folderName?: string;
  documentKind?: 'drawing' | 'specification' | 'file';
  tags?: string[];
  onPortalFallback?: (file: File) => void;
};

export class ProjectUploadError extends Error {
  stage: ProjectUploadStage;

  constructor(stage: ProjectUploadStage, message: string) {
    super(message);
    this.name = 'ProjectUploadError';
    this.stage = stage;
  }
}

export function contentTypeFor(file: File) {
  if (file.type) return file.type;
  if (/\.pdf$/i.test(file.name)) return 'application/pdf';
  if (/\.png$/i.test(file.name)) return 'image/png';
  if (/\.jpe?g$/i.test(file.name)) return 'image/jpeg';
  if (/\.docx?$/i.test(file.name)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (/\.xlsx?$/i.test(file.name)) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  return 'application/octet-stream';
}

export function fileTypeFor(name: string, mime?: string | null): UploadedProjectFile['fileType'] {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  if (mime?.includes('spreadsheet') || /\.(xlsx|xls|csv)$/i.test(name)) return 'xlsx';
  if (mime?.includes('word') || /\.(docx|doc)$/i.test(name)) return 'docx';
  return 'file';
}

type UploadResponse = {
  id?: unknown;
  name?: unknown;
  storageKey?: unknown;
  url?: unknown;
  key?: unknown;
  uploadToken?: unknown;
  warning?: unknown;
  error?: unknown;
};

async function readJson(response: Response): Promise<UploadResponse> {
  return await response.json().catch(() => ({}));
}

function errorMessage(result: UploadResponse, fallback: string) {
  return typeof result.error === 'string' ? result.error : fallback;
}

function uploadedFileResult(file: File, result: UploadResponse, folderName: string, mimeType: string): UploadedProjectFile {
  if (typeof result.id !== 'string' || !result.id) {
    throw new ProjectUploadError('register', 'Upload completed, but the portal did not return a file id.');
  }
  const name = typeof result.name === 'string' && result.name ? result.name : file.name;
  return {
    id: result.id,
    name,
    storageKey: typeof result.storageKey === 'string' ? result.storageKey : undefined,
    sizeBytes: file.size,
    sizeLabel: bytesToSize(file.size),
    mimeType,
    fileType: fileTypeFor(name, mimeType),
    path: folderName ? `${folderName}/${name}` : name,
    warning: typeof result.warning === 'string' ? result.warning : undefined
  };
}

async function uploadThroughPortal(input: UploadProjectFileInput, mimeType: string) {
  const form = new FormData();
  form.set('projectSlug', input.projectSlug);
  form.set('folderName', input.folderName?.trim() ?? '');
  form.set('documentKind', input.documentKind ?? 'file');
  if (input.tags?.length) form.set('tags', JSON.stringify(input.tags));
  form.set('file', input.file, input.file.name);

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: form
  });
  const result = await readJson(response);
  if (!response.ok) throw new ProjectUploadError('server', errorMessage(result, 'Portal upload failed.'));
  return uploadedFileResult(input.file, result, input.folderName?.trim() ?? '', mimeType);
}

async function uploadDirectToStorage(input: UploadProjectFileInput, mimeType: string) {
  const uploadUrlResponse = await fetch('/api/files/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectSlug: input.projectSlug,
      filename: input.file.name,
      sizeBytes: input.file.size,
      contentType: mimeType,
      documentKind: input.documentKind ?? 'file'
    })
  });
  const uploadUrl = await readJson(uploadUrlResponse);
  if (!uploadUrlResponse.ok || typeof uploadUrl.url !== 'string' || typeof uploadUrl.key !== 'string') {
    throw new ProjectUploadError('prepare', errorMessage(uploadUrl, 'Could not prepare upload.'));
  }

  let storageResponse: Response;
  try {
    storageResponse = await fetch(uploadUrl.url, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: input.file
    });
  } catch (error) {
    throw new ProjectUploadError('network', error instanceof Error ? error.message : 'Storage upload failed.');
  }
  if (!storageResponse.ok) {
    const details = await storageResponse.text().catch(() => '');
    throw new ProjectUploadError('storage', `Storage upload failed (${storageResponse.status}): ${details || storageResponse.statusText}`);
  }

  const registerResponse = await fetch('/api/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      projectSlug: input.projectSlug,
      key: uploadUrl.key,
      name: input.file.name,
      sizeBytes: input.file.size,
      mimeType,
      folderName: input.folderName?.trim() ?? '',
      documentKind: input.documentKind ?? 'file',
      tags: input.tags ?? [],
      uploadToken: uploadUrl.uploadToken
    })
  });
  const result = await readJson(registerResponse);
  if (!registerResponse.ok) {
    throw new ProjectUploadError('register', errorMessage(result, 'Upload saved to storage, but portal registration failed.'));
  }
  return uploadedFileResult(input.file, result, input.folderName?.trim() ?? '', mimeType);
}

export async function uploadProjectFile(input: UploadProjectFileInput) {
  const mimeType = contentTypeFor(input.file);
  try {
    return await uploadDirectToStorage(input, mimeType);
  } catch (error) {
    if (!(error instanceof ProjectUploadError) || (error.stage !== 'network' && error.stage !== 'storage')) throw error;
    if (input.file.size > PORTAL_FALLBACK_LIMIT_BYTES) {
      throw new ProjectUploadError(
        error.stage,
        `${error.message} Direct storage uploads must be allowed for files over 4 MB. Check the Tigris bucket CORS settings and try again.`
      );
    }
    input.onPortalFallback?.(input.file);
    return await uploadThroughPortal(input, mimeType);
  }
}
