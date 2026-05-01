import { error } from '@sveltejs/kit';
import { getProject, getProjects } from '$lib/server/queries';
import {
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess
} from '$lib/server/project-access';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async (event) => {
  // Parallelize the four queries the layout needs so we don't pay sequential
  // round-trips for what is essentially a header render. requireProjectAccess
  // is the new addition (used by the Members tab gate) — it does its own
  // project + member lookups, so it's expected to overlap getProject.
  const [project, projects, me, accessResult] = await Promise.all([
    getProject(event, event.params.slug),
    getProjects(event),
    event.locals.getCurrentUser(),
    event.locals.supabase
      ? requireProjectAccess(event, event.params.slug)
      : Promise.resolve(null)
  ]);
  if (!project) throw error(404, 'Project not found');

  // Resolve the viewer's role on this project so the header can show the
  // Members tab to admins/superadmins. Non-members fall through to null.
  let projectRole: string | null = null;
  let canManageProjectUsers = false;
  if (accessResult && !isProjectAccessError(accessResult)) {
    projectRole = accessResult.role;
    canManageProjectUsers = projectRoleCapabilities[accessResult.role].canManageProjectUsers;
  }

  return {
    project,
    projects,
    slug: event.params.slug,
    me,
    projectAccess: {
      role: projectRole,
      canManageProjectUsers
    }
  };
};
