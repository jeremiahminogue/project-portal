import type { RequestEvent } from '@sveltejs/kit';
import { bytesToSize } from '$lib/utils';
import { registerUploadedFile } from './file-ingest';
import { buildStorageKey, putObject, storageErrorMessage } from './object-storage';
import type { ProjectAccess } from './project-access';

const MAX_ATTACHMENT_BYTES = 100 * 1024 * 1024;
const MAX_ATTACHMENTS_PER_SAVE = 10;

type Client = NonNullable<App.Locals['supabase']>;

type UploadedFile = {
  name: string;
  size: number;
  type?: string;
  arrayBuffer: () => Promise<ArrayBuffer>;
};

export type ItemAttachment = {
  id?: string;
  name: string;
  size: string;
  type: string;
  path?: string;
};

function isUploadedFile(value: unknown): value is UploadedFile {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<UploadedFile>;
  return (
    typeof candidate.name === 'string' &&
    typeof candidate.size === 'number' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

function fileTypeFor(name: string, mime?: string | null) {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.includes('spreadsheet') || /\.(xlsx|xls|csv)$/i.test(name)) return 'xlsx';
  if (mime?.includes('word') || /\.(docx|doc)$/i.test(name)) return 'docx';
  if (mime?.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  return 'file';
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

function normalizeAttachment(value: unknown): ItemAttachment | null {
  const attachment = value as Partial<ItemAttachment> | null;
  if (!attachment?.name) return null;
  return {
    name: String(attachment.name),
    size: typeof attachment.size === 'string' ? attachment.size : '',
    type: typeof attachment.type === 'string' ? attachment.type : 'file',
    ...(typeof attachment.id === 'string' ? { id: attachment.id } : {}),
    ...(typeof attachment.path === 'string' ? { path: attachment.path } : {})
  };
}

export function normalizeItemAttachments(value: unknown): ItemAttachment[] {
  const candidate = Array.isArray(value)
    ? value
    : Array.isArray((value as { attachments?: unknown[] } | null)?.attachments)
      ? (value as { attachments: unknown[] }).attachments
      : [];
  return candidate.map(normalizeAttachment).filter((attachment): attachment is ItemAttachment => Boolean(attachment));
}

export function mergeItemAttachments(...groups: ItemAttachment[][]) {
  const byKey = new Map<string, ItemAttachment>();
  for (const attachment of groups.flat()) {
    const key = attachment.id ? `id:${attachment.id}` : `name:${attachment.path ?? attachment.name}`;
    byKey.set(key, attachment);
  }
  return [...byKey.values()];
}

export function formHasItemAttachments(form: FormData, fileFieldName = 'attachments', linkedFieldName = 'attachmentIds') {
  const hasLinkedFile = form
    .getAll(linkedFieldName)
    .some((value) => typeof value === 'string' && value.trim().length > 0);
  const hasUploadedFile = form.getAll(fileFieldName).some((value) => isUploadedFile(value) && value.size > 0);
  return hasLinkedFile || hasUploadedFile;
}

export async function existingFileAttachmentsFor(client: Client, projectId: string, ids: string[]) {
  const attachmentIds = [...new Set(ids)].filter(Boolean);
  if (attachmentIds.length > MAX_ATTACHMENTS_PER_SAVE) {
    throw new Error(`Attach up to ${MAX_ATTACHMENTS_PER_SAVE} existing project files at a time.`);
  }
  if (!attachmentIds.length) return [];

  const { data, error } = await client
    .from('files')
    .select('id, name, size_bytes, mime_type, parent_folder_id')
    .eq('project_id', projectId)
    .eq('is_folder', false)
    .in('id', attachmentIds);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length !== attachmentIds.length) {
    throw new Error('One or more selected project files could not be attached.');
  }

  const folderIds = [...new Set(rows.map((row: any) => row.parent_folder_id).filter(Boolean) as string[])];
  const folderById = new Map<string, string>();
  if (folderIds.length) {
    const { data: folders, error: folderError } = await client.from('files').select('id, name').in('id', folderIds);
    if (folderError) throw new Error(folderError.message);
    for (const folder of folders ?? []) folderById.set(folder.id, folder.name);
  }

  const byId = new Map(rows.map((row: any) => [row.id, row]));
  return attachmentIds.flatMap((id) => {
    const row = byId.get(id);
    if (!row) return [];
    const folder = row.parent_folder_id ? folderById.get(row.parent_folder_id) : null;
    return {
      id: row.id,
      name: row.name,
      size: bytesToSize(row.size_bytes),
      type: fileTypeFor(row.name, row.mime_type),
      path: folder ? `${folder}/${row.name}` : row.name
    };
  });
}

export async function uploadedItemAttachmentsFor({
  event,
  access,
  form,
  folderName,
  fieldName = 'attachments'
}: {
  event: RequestEvent;
  access: ProjectAccess;
  form: FormData;
  folderName: string;
  fieldName?: string;
}) {
  const files: UploadedFile[] = [];
  for (const value of form.getAll(fieldName)) {
    if (isUploadedFile(value) && value.size > 0) files.push(value);
  }
  if (files.length > MAX_ATTACHMENTS_PER_SAVE) {
    throw new Error(`Upload up to ${MAX_ATTACHMENTS_PER_SAVE} files at a time.`);
  }
  const attachments: ItemAttachment[] = [];

  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) throw new Error(`${file.name} is too large.`);
    const mimeType = contentTypeFor(file.name, file.type);
    const storageKey = buildStorageKey(access.project.slug, file.name);
    const bytes = new Uint8Array(await file.arrayBuffer());

    try {
      await putObject(storageKey, bytes, mimeType);
    } catch (error) {
      throw new Error(storageErrorMessage(error, `upload ${file.name}`));
    }

    const result = await registerUploadedFile({
      event,
      access,
      storageKey,
      name: file.name,
      sizeBytes: file.size,
      mimeType,
      folderName,
      documentKind: 'file',
      tags: ['attachment'],
      bytes
    });

    attachments.push({
      id: result.id,
      name: file.name,
      size: bytesToSize(file.size),
      type: fileTypeFor(file.name, mimeType),
      path: `${folderName}/${file.name}`
    });
  }

  return attachments;
}
