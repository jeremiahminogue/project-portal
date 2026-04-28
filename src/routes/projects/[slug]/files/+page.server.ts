import { error } from '@sveltejs/kit';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getFiles, getFolders, getProject } from '$lib/server/queries';
import type { PageServerLoad } from './$types';

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
