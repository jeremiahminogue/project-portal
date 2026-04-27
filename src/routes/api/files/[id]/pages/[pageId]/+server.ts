import { json } from '@sveltejs/kit';
import { parseSheetName } from '$lib/server/drawing-ocr';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { createAdminClient } from '$lib/server/supabase-admin';
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

function pageName(sheetNumber: string | null, sheetTitle: string | null, fallback: string) {
  if (sheetNumber && sheetTitle) return `${sheetNumber} - ${sheetTitle}`;
  return sheetNumber ?? sheetTitle ?? fallback;
}

export const PATCH: RequestHandler = async (event) => {
  const client = event.locals.isLocalSuperadmin ? createAdminClient() : event.locals.supabase;
  if (!client) return json({ error: 'Supabase is not configured yet.' }, { status: 400 });

  const { data: page, error: pageError } = await client
    .from('drawing_pages')
    .select('id, file_id, project_id, page_number, name')
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

  const body = await event.request.json().catch(() => null);
  const requestedName = cleanName(body?.name);
  const requestedSheetNumber = cleanSheetNumber(body?.sheetNumber);
  const requestedSheetTitle = cleanName(body?.sheetTitle) || null;
  const parsed = parseSheetName(requestedName || `${requestedSheetNumber ?? ''} ${requestedSheetTitle ?? ''}`.trim());
  const sheetNumber = requestedSheetNumber ?? parsed.sheetNumber;
  const sheetTitle = requestedSheetTitle ?? parsed.sheetTitle;
  const name = requestedName || pageName(sheetNumber, sheetTitle, page.name);
  if (!name) return json({ error: 'Page name is required.' }, { status: 400 });

  const { data, error } = await client
    .from('drawing_pages')
    .update({
      name,
      sheet_number: sheetNumber,
      sheet_title: sheetTitle ?? name,
      revision: parsed.revision
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
