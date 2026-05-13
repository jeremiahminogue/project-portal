import { error } from '@sveltejs/kit';
import { getProject, getProjects } from '$lib/server/queries';
import {
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess,
  type ProjectRole
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
  // right tool set for each role. Non-members fall through to null.
  let projectRole: ProjectRole | null = null;
  let capabilities = {
    canCreateCommunication: false,
    canReviewCommunication: false,
    canManageSchedule: false,
    canManageDirectory: false,
    canManageProjectUsers: false
  };
  if (accessResult && !isProjectAccessError(accessResult)) {
    projectRole = accessResult.role;
    const roleCapabilities = projectRoleCapabilities[accessResult.role];
    capabilities = {
      canCreateCommunication: roleCapabilities.canCreateCommunication,
      canReviewCommunication: roleCapabilities.canReviewCommunication,
      canManageSchedule: roleCapabilities.canManageSchedule,
      canManageDirectory: roleCapabilities.canManageDirectory,
      canManageProjectUsers: roleCapabilities.canManageProjectUsers
    };
  } else if (!event.locals.supabase && me.user) {
    projectRole = me.isSuperadmin ? 'superadmin' : 'admin';
    const roleCapabilities = projectRoleCapabilities[projectRole];
    capabilities = {
      canCreateCommunication: roleCapabilities.canCreateCommunication,
      canReviewCommunication: roleCapabilities.canReviewCommunication,
      canManageSchedule: roleCapabilities.canManageSchedule,
      canManageDirectory: roleCapabilities.canManageDirectory,
      canManageProjectUsers: roleCapabilities.canManageProjectUsers
    };
  }

  return {
    project,
    projects,
    slug: event.params.slug,
    me,
    projectAccess: {
      role: projectRole,
      ...capabilities,
      canManageNotifications: projectRole === 'superadmin' || projectRole === 'admin'
    }
  };
};
