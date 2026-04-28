import { fail } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { sendPortalEmail, textToHtml } from '$lib/server/email';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getDirectory, getFiles, getProject, getUpdates } from '$lib/server/queries';
import { bytesToSize } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, updates, directory, files] = await Promise.all([
    getProject(event, event.params.slug),
    getUpdates(event, event.params.slug),
    getDirectory(event, event.params.slug),
    getFiles(event, event.params.slug)
  ]);
  return { project, updates, directory, files };
};

function fileTypeFor(name: string, mime?: string | null) {
  if (mime?.startsWith('image/')) return 'image';
  if (mime?.includes('spreadsheet') || /\.(xlsx|xls|csv)$/i.test(name)) return 'xlsx';
  if (mime?.includes('word') || /\.(docx|doc)$/i.test(name)) return 'docx';
  if (mime?.includes('pdf') || /\.pdf$/i.test(name)) return 'pdf';
  return 'file';
}

async function updateAttachmentsFor(client: NonNullable<App.Locals['supabase']>, projectId: string, ids: string[]) {
  const attachmentIds = [...new Set(ids)].filter(Boolean).slice(0, 10);
  if (!attachmentIds.length) return [];

  const { data, error } = await client
    .from('files')
    .select('id, name, size_bytes, mime_type, parent_folder_id')
    .eq('project_id', projectId)
    .eq('is_folder', false)
    .in('id', attachmentIds);

  if (error) throw new Error(error.message);

  const rows = data ?? [];
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

export const actions: Actions = {
  postUpdate: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      writable: true,
      action: 'post updates for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    const title = formString(form, 'title');
    const body = formString(form, 'body');
    const kind = formString(form, 'kind') || 'general';
    const notify = form.get('notify') === 'on';
    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');

    if (!title || !body) return fail(400, { error: 'Title and body are required.' });

    let attachments: Awaited<ReturnType<typeof updateAttachmentsFor>> = [];
    try {
      attachments = await updateAttachmentsFor(client, access.project.id, attachmentIds);
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const { error } = await client.from('updates').insert({
      project_id: access.project.id,
      title,
      body,
      kind,
      attachments_json: attachments,
      author_id: access.user.id
    });
    if (error) return fail(400, { error: error.message });

    if (notify) {
      const directory = await getDirectory(event, event.params.slug);
      await sendPortalEmail({
        to: directory.map((person) => person.email).filter(Boolean) as string[],
        subject: `Project update: ${title}`,
        html: textToHtml(body)
      });
    }

    return { ok: true };
  }
};
