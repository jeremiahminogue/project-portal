import { error } from '@sveltejs/kit';
import { isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
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
      role,
      canModify: role ? projectRoleCapabilities[role].canEditFiles : !event.locals.supabase,
      canMarkup: role ? projectRoleCapabilities[role].canMarkupFiles : !event.locals.supabase,
      canUpload: role ? projectRoleCapabilities[role].canUploadFiles : !event.locals.supabase,
      canDelete: role ? projectRoleCapabilities[role].canDeleteFiles : !event.locals.supabase,
      canReindex: role ? projectRoleCapabilities[role].canReindexFiles : !event.locals.supabase
    }
  };
};
