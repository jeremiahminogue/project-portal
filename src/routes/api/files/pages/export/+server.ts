import { json } from '@sveltejs/kit';
import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import {
  contentDisposition,
  getObject,
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

const MAX_EXPORT_PAGES = 250;

type ExportMode = 'combined' | 'separate';

type PageRow = {
  id: string;
  file_id: string;
  project_id: string;
  page_number: number;
  name: string;
  sheet_number: string | null;
  sheet_title: string | null;
};

type FileRow = {
  id: string;
  name: string;
  storage_key: string | null;
  mime_type: string | null;
  project_id: string;
};

type SelectedPagesResult =
  | { error: Response }
  | { pages: PageRow[]; fileById: Map<string, FileRow> };

function stringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [];
}

function exportMode(value: unknown): ExportMode {
  return value === 'separate' ? 'separate' : 'combined';
}

function safeBaseName(value: string) {
  return value
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'drawing-page';
}

function pageFilename(page: PageRow, file: FileRow) {
  const number = page.sheet_number ?? `Page_${page.page_number}`;
  const title = page.sheet_title ?? page.name ?? file.name;
  return `${safeBaseName(`${number}_${title}`)}.pdf`;
}

async function objectBytes(key: string) {
  const object = await getObject(key);
  const body = responseBody(object.Body);
  const response = new Response(body);
  return new Uint8Array(await response.arrayBuffer());
}

function byteBody(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

async function selectedPages(event: Parameters<RequestHandler>[0], pageIds: string[]): Promise<SelectedPagesResult> {
  let client = await databaseClientForCurrentUser(event);
  if (!client) return { error: json({ error: 'Supabase is not configured yet.' }, { status: 400 }) };

  const { data: pages, error: pagesError } = await client
    .from('drawing_pages')
    .select('id, file_id, project_id, page_number, name, sheet_number, sheet_title')
    .in('id', pageIds);

  if (pagesError) return { error: json({ error: pagesError.message }, { status: 500 }) };
  if (!pages?.length) return { error: json({ error: 'Select at least one drawing page.' }, { status: 400 }) };

  const fileIds = [...new Set(pages.map((page: PageRow) => page.file_id))];
  const projectIds = [...new Set(pages.map((page: PageRow) => page.project_id))];

  const { data: projects, error: projectsError } = await client
    .from('projects')
    .select('id, slug')
    .in('id', projectIds);

  if (projectsError) return { error: json({ error: projectsError.message }, { status: 500 }) };
  const projectById = new Map((projects ?? []).map((project: { id: string; slug: string }) => [project.id, project.slug]));

  const projectClients = new Map<string, NonNullable<typeof client>>();
  for (const projectId of projectIds) {
    const slug = projectById.get(projectId);
    if (!slug) return { error: json({ error: 'Project not found.' }, { status: 404 }) };
    const access = await requireProjectAccess(event, slug);
    if (isProjectAccessError(access)) return { error: json({ error: access.message }, { status: access.status }) };
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return { error: json({ error: 'Supabase is not configured yet.' }, { status: 400 }) };
    projectClients.set(projectId, projectClient);
  }

  client = projectClients.values().next().value ?? client;
  const { data: files, error: filesError } = await client
    .from('files')
    .select('id, name, storage_key, mime_type, project_id')
    .in('id', fileIds)
    .eq('is_folder', false);

  if (filesError) return { error: json({ error: filesError.message }, { status: 500 }) };
  const fileById = new Map((files ?? []).map((file: FileRow) => [file.id, file]));
  const orderedPages = pageIds
    .map((id) => (pages as PageRow[]).find((page) => page.id === id))
    .filter((page): page is PageRow => Boolean(page));

  return { pages: orderedPages, fileById };
}

export const POST: RequestHandler = async (event) => {
  const body = await event.request.json().catch(() => null);
  const pageIds = [...new Set(stringList(body?.pageIds))];
  const mode = exportMode(body?.mode);

  if (!pageIds.length) return json({ error: 'Select at least one drawing page.' }, { status: 400 });
  if (pageIds.length > MAX_EXPORT_PAGES) {
    return json({ error: `Export up to ${MAX_EXPORT_PAGES} pages at a time.` }, { status: 400 });
  }

  const selected = await selectedPages(event, pageIds);
  if ('error' in selected) return selected.error;

  const sourceCache = new Map<string, Promise<PDFDocument>>();
  async function sourcePdf(file: FileRow) {
    if (!file.storage_key) throw new Error(`${file.name} does not have a stored PDF.`);
    if (!/pdf/i.test(file.mime_type ?? file.name)) throw new Error(`${file.name} is not a PDF.`);
    let source = sourceCache.get(file.id);
    if (!source) {
      source = objectBytes(file.storage_key).then((bytes) => PDFDocument.load(bytes));
      sourceCache.set(file.id, source);
    }
    return source;
  }

  try {
    if (mode === 'separate') {
      const zip = new JSZip();
      for (const page of selected.pages) {
        const file = selected.fileById.get(page.file_id);
        if (!file) throw new Error('Source file not found for selected page.');
        const source = await sourcePdf(file);
        const output = await PDFDocument.create();
        const [copied] = await output.copyPages(source, [Math.max(0, page.page_number - 1)]);
        output.addPage(copied);
        zip.file(pageFilename(page, file), await output.save());
      }
      const zipped = await zip.generateAsync({ type: 'uint8array' });
      return new Response(byteBody(zipped), {
        headers: {
          'Content-Type': 'application/zip',
          'Content-Disposition': contentDisposition('drawing-pages.zip', 'attachment'),
          'Cache-Control': 'no-store'
        }
      });
    }

    const output = await PDFDocument.create();
    for (const page of selected.pages) {
      const file = selected.fileById.get(page.file_id);
      if (!file) throw new Error('Source file not found for selected page.');
      const source = await sourcePdf(file);
      const [copied] = await output.copyPages(source, [Math.max(0, page.page_number - 1)]);
      output.addPage(copied);
    }
    return new Response(byteBody(await output.save()), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': contentDisposition('drawing-pages.pdf', 'attachment'),
        'Cache-Control': 'no-store'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : storageErrorMessage(error, 'export selected drawing pages');
    const status = error instanceof Error && !('$metadata' in error) ? 400 : storageErrorStatus(error);
    console.error('[files] drawing page export failed:', error);
    return json({ error: message }, { status });
  }
};
