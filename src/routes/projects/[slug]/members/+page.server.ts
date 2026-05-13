import { fail, redirect } from '@sveltejs/kit';
import { actionError, formString } from '$lib/server/auth';
import { writeAdminAudit } from '$lib/server/admin-audit';
import {
  databaseClientForProjectAccess,
  isProjectAccessError,
  projectRoleCapabilities,
  requireProjectAccess,
  type ProjectRole
} from '$lib/server/project-access';
import { isMissingProjectMemberManagerFlagError, stripProjectMemberManagerFlags } from '$lib/server/schema-compat';
import type { Actions, PageServerLoad } from './$types';

const memberRoles = new Set<ProjectRole>(['admin', 'member', 'guest', 'readonly']);

function roleValue(value: string): ProjectRole {
  return memberRoles.has(value as ProjectRole) ? (value as ProjectRole) : 'member';
}

function checked(form: FormData, name: string) {
  return form.get(name) === 'on';
}

function managerFlagNotice(flagsRequested: boolean, managerFlagsSaved: boolean) {
  return flagsRequested && !managerFlagsSaved ? ' Manager flags require the database update before they can be saved.' : '';
}

type MemberRow = {
  userId: string;
  role: ProjectRole;
  isSubmittalManager: boolean;
  isRfiManager: boolean;
  acceptedAt: string | null;
  fullName: string;
  email: string;
  company: string | null;
  title: string | null;
};

/**
 * Per-project members admin. Surfaces every member of the current project
 * along with their role and the submittal/RFI manager flags, and lets a
 * project admin (or superadmin) toggle them inline.
 *
 * Authorization: gated on `canManageProjectUsers` from project-access.ts,
 * which is true for `admin` + `superadmin` only. RLS on project_members
 * matches: insert/update/delete all check `public.is_project_admin`
 * (migrations 0003 + 0017), so the user's own session is enough — no
 * service-role escalation needed.
 */
export const load: PageServerLoad = async (event) => {
  const slug = event.params.slug;

  // Defer all gating to requireProjectAccess. In production-without-supabase
  // it returns 503; in dev-without-supabase it returns a mock admin role.
  // Either way, never grant canManage just because the supabase client is
  // missing — that was a real security hole in an earlier draft.
  const access = await requireProjectAccess(event, slug);
  if (isProjectAccessError(access)) {
    return {
      members: [] as MemberRow[],
      canManage: false,
      currentUserId: null,
      managerFlagsAvailable: false,
      accessError: access.message
    };
  }
  if (!projectRoleCapabilities[access.role].canManageProjectUsers) throw redirect(303, `/projects/${slug}`);

  const projectClient = databaseClientForProjectAccess(event, access);
  if (!projectClient) {
    // Mock-only dev path. No DB to query, so just render the empty roster
    // with canManage off so the UI doesn't pretend a write would land.
    return {
      members: [] as MemberRow[],
      canManage: false,
      currentUserId: access.user.id,
      managerFlagsAvailable: false
    };
  }

  let managerFlagsAvailable = true;
  let memberRows: any = await projectClient
    .from('project_members')
    .select('user_id, role, is_submittal_manager, is_rfi_manager, accepted_at')
    .eq('project_id', access.project.id);
  if (memberRows.error && isMissingProjectMemberManagerFlagError(memberRows.error)) {
    managerFlagsAvailable = false;
    memberRows = await projectClient
      .from('project_members')
      .select('user_id, role, accepted_at')
      .eq('project_id', access.project.id);
  }
  const { data: rows, error } = memberRows;
  if (error) throw new Error(`load members failed: ${error.message}`);

  const userIds = ((rows ?? []) as Array<{ user_id: string | null }>)
    .map((row: { user_id: string | null }) => row.user_id)
    .filter((id: string | null): id is string => Boolean(id));

  let profilesById = new Map<string, { id: string; full_name: string | null; email: string | null; company: string | null; title: string | null }>();
  if (userIds.length) {
    const { data: profiles, error: profilesError } = await projectClient
      .from('profiles')
      .select('id, full_name, email, company, title')
      .in('id', userIds);
    if (profilesError) throw new Error(`load profiles failed: ${profilesError.message}`);
    profilesById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
  }

  const members: MemberRow[] = ((rows ?? []) as any[])
    .map((row: any) => {
      const profile = profilesById.get(row.user_id);
      return {
        userId: row.user_id,
        role: row.role as ProjectRole,
        isSubmittalManager: Boolean(row.is_submittal_manager),
        isRfiManager: Boolean(row.is_rfi_manager),
        acceptedAt: row.accepted_at ?? null,
        fullName: profile?.full_name ?? profile?.email ?? row.user_id,
        email: profile?.email ?? '',
        company: profile?.company ?? null,
        title: profile?.title ?? null
      };
    })
    .sort((a: MemberRow, b: MemberRow) => {
      // Admins first, then alphabetical by name. Keeps managers at the top
      // of the list since they're usually project admins as well.
      const roleScore = (role: ProjectRole) => (role === 'admin' ? 0 : role === 'member' ? 1 : role === 'guest' ? 2 : 3);
      const diff = roleScore(a.role) - roleScore(b.role);
      if (diff !== 0) return diff;
      return a.fullName.localeCompare(b.fullName);
    });

  return {
    members,
    canManage: projectRoleCapabilities[access.role].canManageProjectUsers,
    currentUserId: access.user.id,
    managerFlagsAvailable
  };
};

export const actions: Actions = {
  updateMember: async (event) => {
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    if (!userId) return fail(400, { error: 'Missing user id.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'manage members for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');

    const role = roleValue(formString(form, 'role'));
    const isSubmittalManager = checked(form, 'isSubmittalManager');
    const isRfiManager = checked(form, 'isRfiManager');

    // Refuse to demote yourself out of admin — same guard the platform-wide
    // admin user delete uses. A project with zero admins becomes unmanageable.
    if (userId === access.user.id && role !== 'admin' && access.role !== 'superadmin') {
      return fail(400, { error: 'You cannot demote yourself out of project admin.' });
    }

    const managerFlagsRequested = isSubmittalManager || isRfiManager;
    let managerFlagsSaved = true;
    const payload = {
      role,
      is_submittal_manager: isSubmittalManager,
      is_rfi_manager: isRfiManager
    };
    let result = await projectClient
      .from('project_members')
      .update(payload)
      .eq('project_id', access.project.id)
      .eq('user_id', userId);
    if (result.error && isMissingProjectMemberManagerFlagError(result.error)) {
      managerFlagsSaved = false;
      result = await projectClient
        .from('project_members')
        .update(stripProjectMemberManagerFlags(payload))
        .eq('project_id', access.project.id)
        .eq('user_id', userId);
    }
    if (result.error) return fail(400, { error: result.error.message });

    await writeAdminAudit(event, 'membership.update', 'user', userId, {
      projectId: access.project.id,
      slug: access.project.slug,
      role,
      isSubmittalManager: managerFlagsSaved ? isSubmittalManager : false,
      isRfiManager: managerFlagsSaved ? isRfiManager : false,
      managerFlagsSaved,
      via: 'project-members-page'
    });

    return { ok: true, message: `Member updated.${managerFlagNotice(managerFlagsRequested, managerFlagsSaved)}` };
  },

  removeMember: async (event) => {
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    if (!userId) return fail(400, { error: 'Missing user id.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'manage members for this project'
    });
    if (isProjectAccessError(access)) return actionError(access.message, access.status);

    if (userId === access.user.id && access.role !== 'superadmin') {
      return fail(400, { error: 'You cannot remove yourself from a project. Ask another admin or a superadmin.' });
    }

    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return actionError('Supabase is not configured yet.');

    const { error } = await projectClient
      .from('project_members')
      .delete()
      .eq('project_id', access.project.id)
      .eq('user_id', userId);
    if (error) return fail(400, { error: error.message });

    await writeAdminAudit(event, 'membership.remove', 'user', userId, {
      projectId: access.project.id,
      slug: access.project.slug,
      via: 'project-members-page'
    });

    return { ok: true, message: 'Member removed.' };
  }
};
