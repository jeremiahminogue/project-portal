import type { RequestEvent } from '@sveltejs/kit';
import { isProductionRuntime } from './env';
import { createAdminClient, hasSupabaseAdminConfig } from './supabase-admin';

const writableRoles = new Set(['admin', 'member']);
const allProjectRoles = new Set(['superadmin', 'admin', 'member', 'guest', 'readonly']);

export type ProjectAccess = {
  project: {
    id: string;
    slug: string;
    name?: string;
  };
  user: {
    id: string;
    email: string | null;
  };
  role: 'superadmin' | 'admin' | 'member' | 'guest' | 'readonly';
};

export type ProjectAccessError = {
  status: number;
  message: string;
};

export async function databaseClientForCurrentUser(event: RequestEvent) {
  const me = await event.locals.getCurrentUser();
  if (me.isSuperadmin && hasSupabaseAdminConfig()) return createAdminClient();
  return event.locals.supabase;
}

export function databaseClientForProjectAccess(event: RequestEvent, access: ProjectAccess) {
  if (access.role === 'superadmin' && hasSupabaseAdminConfig()) return createAdminClient();
  return event.locals.supabase;
}

export async function requireProjectAccess(
  event: RequestEvent,
  projectSlug: string,
  options: { writable?: boolean; roles?: ProjectAccess['role'][]; action?: string } = {}
): Promise<ProjectAccess | ProjectAccessError> {
  const me = await event.locals.getCurrentUser();
  if (!me.user) return { status: 401, message: 'Not signed in.' };

  const client = me.isSuperadmin && hasSupabaseAdminConfig() ? createAdminClient() : event.locals.supabase;
  if (!client) {
    if (isProductionRuntime()) return { status: 503, message: 'Portal authentication is not configured.' };
    return {
      project: { id: projectSlug, slug: projectSlug, name: projectSlug },
      user: me.user,
      role: me.isSuperadmin ? 'superadmin' : 'admin'
    };
  }

  const { data: project, error: projectError } = await client
    .from('projects')
    .select('id, slug, name')
    .eq('slug', projectSlug)
    .maybeSingle();

  if (projectError) return { status: 500, message: projectError.message };
  if (!project) return { status: 404, message: 'Project not found.' };

  if (me.isSuperadmin) {
    return { project, user: me.user, role: 'superadmin' };
  }

  const { data: member, error: memberError } = await client
    .from('project_members')
    .select('role')
    .eq('project_id', project.id)
    .eq('user_id', me.user.id)
    .maybeSingle();

  if (memberError) return { status: 500, message: memberError.message };
  if (!member) return { status: 403, message: 'You do not have access to this project.' };
  if (!allProjectRoles.has(member.role)) {
    return { status: 403, message: 'Your project role is not recognized.' };
  }
  if (options.writable && !writableRoles.has(member.role)) {
    return { status: 403, message: `Not authorized to ${options.action ?? 'modify this project'}.` };
  }
  if (options.roles && !options.roles.includes(member.role)) {
    return { status: 403, message: `Not authorized to ${options.action ?? 'modify this project'}.` };
  }

  return { project, user: me.user, role: member.role };
}

export function isProjectAccessError(value: ProjectAccess | ProjectAccessError): value is ProjectAccessError {
  return 'status' in value;
}
