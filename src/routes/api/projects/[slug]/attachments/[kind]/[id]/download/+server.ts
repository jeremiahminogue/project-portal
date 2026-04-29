import { json } from '@sveltejs/kit';
import JSZip from 'jszip';
import { normalizeItemAttachments } from '$lib/server/item-attachments';
import { contentDisposition, getObject, responseBody, storageErrorMessage, storageErrorStatus } from '$lib/server/object-storage';
import { databaseClientForProjectAccess, isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import type { RequestHandler } from './$types';

const MAX_ARCHIVE_ATTACHMENTS = 250;
const MAX_ARCHIVE_BYTES = 500 * 1024 * 1024;

const itemTables = {
  rfi: { table: 'rfis', label: 'RFI' },
  submittal: { table: 'submittals', label: 'Submittal' }
} as const;

type AttachmentKind = keyof typeof itemTables;

type FileRow = {
  id: string;
  name: string;
  storage_key: string | null;
  size_bytes: number | null;
};

function attachmentKind(value: string): AttachmentKind | null {
  return value === 'rfi' || value === 'submittal' ? value : null;
}

function safeArchivePart(value: string) {
  return (
    value
      .replace(/[\\/]+/g, ' - ')
      .replace(/[^\w .()#-]+/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120) || 'attachments'
  );
}

function uniqueZipName(name: string, used: Set<string>) {
  const safeName = safeArchivePart(name);
  if (!used.has(safeName)) {
    used.add(safeName);
    return safeName;
  }

  const extMatch = /(\.[^.]+)$/.exec(safeName);
  const ext = extMatch?.[1] ?? '';
  const base = ext ? safeName.slice(0, -ext.length) : safeName;
  let index = 2;
  let candidate = `${base} (${index})${ext}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${base} (${index})${ext}`;
  }
  used.add(candidate);
  return candidate;
}

function byteBody(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function objectBytes(key: string) {
  const object = await getObject(key);
  const body = responseBody(object.Body);
  const response = new Response(body);
  return new Uint8Array(await response.arrayBuffer());
}

export const GET: RequestHandler = async (event) => {
  const kind = attachmentKind(event.params.kind);
  if (!kind) return json({ error: 'Attachment download type must be rfi or submittal.' }, { status: 400 });

  const access = await requireProjectAccess(event, event.params.slug);
  if (isProjectAccessError(access)) return json({ error: access.message }, { status: access.status });

  const client = databaseClientForProjectAccess(event, access);
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const definition = itemTables[kind];
  const { data: item, error: itemError } = await client
    .from(definition.table)
    .select('id, number, title, attachments_json')
    .eq('id', event.params.id)
    .eq('project_id', access.project.id)
    .maybeSingle();

  if (itemError) return json({ error: itemError.message }, { status: 500 });
  if (!item) return json({ error: `${definition.label} not found.` }, { status: 404 });

  const attachments = normalizeItemAttachments(item.attachments_json).filter((attachment) => attachment.id);
  if (!attachments.length) return json({ error: 'This item does not have downloadable attachments.' }, { status: 404 });
  if (attachments.length > MAX_ARCHIVE_ATTACHMENTS) {
    return json({ error: `Download up to ${MAX_ARCHIVE_ATTACHMENTS} attachments at a time.` }, { status: 400 });
  }

  const attachmentIds = attachments.map((attachment) => attachment.id as string);
  const { data: files, error: filesError } = await client
    .from('files')
    .select('id, name, storage_key, size_bytes')
    .eq('project_id', access.project.id)
    .eq('is_folder', false)
    .in('id', attachmentIds);

  if (filesError) return json({ error: filesError.message }, { status: 500 });

  const fileById = new Map((files ?? []).map((file: FileRow) => [file.id, file]));
  const missingAttachment = attachments.find((attachment) => !fileById.get(attachment.id as string)?.storage_key);
  if (missingAttachment) {
    return json({ error: `${missingAttachment.name} is not available for download.` }, { status: 404 });
  }

  const archiveBytes = [...fileById.values()].reduce((total, file) => total + (file.size_bytes ?? 0), 0);
  if (archiveBytes > MAX_ARCHIVE_BYTES) {
    return json({ error: 'Download a smaller set of attachments. This archive is over 500 MB.' }, { status: 400 });
  }

  try {
    const zip = new JSZip();
    const usedNames = new Set<string>();
    for (const attachment of attachments) {
      const file = fileById.get(attachment.id as string);
      if (!file?.storage_key) throw new Error(`${attachment.name} is not available for download.`);
      zip.file(uniqueZipName(attachment.path ?? file.name, usedNames), await objectBytes(file.storage_key));
    }

    const archive = await zip.generateAsync({ type: 'uint8array' });
    const archiveName = `${safeArchivePart(`${definition.label} ${item.number ?? item.title ?? event.params.id}`)} Attachments.zip`;

    return new Response(byteBody(archive), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': contentDisposition(archiveName, 'attachment'),
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    console.error('[attachments] bulk attachment download failed:', error);
    return json(
      { error: storageErrorMessage(error, 'download these attachments') },
      { status: storageErrorStatus(error) }
    );
  }
};
