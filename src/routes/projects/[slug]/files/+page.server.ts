import { error, fail } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getFiles, getFolders, getProject } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const project = await getProject(event, event.params.slug);
  if (!project) throw error(404, 'Project not found');
  const [files, folders] = await Promise.all([getFiles(event, event.params.slug), getFolders(event, event.params.slug)]);

  const access = event.locals.supabase ? await requireProjectAccess(event, event.params.slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;

  return {
    project,
    files,
    folders,
    fileAccess: {
      canModify: !event.locals.supabase || role === 'superadmin' || role === 'admin' || role === 'member',
      canDelete: !event.locals.supabase || role === 'superadmin' || role === 'admin'
    }
  };
};

export const actions: Actions = {
  createFolder: async (event) => {
    const name = formString(await event.request.formData(), 'name');
    if (!name) return fail(400, { error: 'Folder name is required.' });
    if (/[\\/]/.test(name)) return fail(400, { error: 'Folder names cannot include slashes.' });

    const access = await requireProjectAccess(event, event.params.slug, { writable: true });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    if (!event.locals.supabase) return fail(400, { error: 'Supabase is not configured yet.' });

    const { data: existing, error: existingError } = await event.locals.supabase
      .from('files')
      .select('id')
      .eq('project_id', access.project.id)
      .eq('is_folder', true)
      .eq('name', name)
      .maybeSingle();

    if (existingError) return fail(400, { error: existingError.message });
    if (existing) return { ok: true };

    const { error: insertError } = await event.locals.supabase.from('files').insert({
      project_id: access.project.id,
      name,
      is_folder: true,
      uploaded_by: access.user.id
    });

    if (insertError) return fail(400, { error: insertError.message });
    return { ok: true };
  }
};
