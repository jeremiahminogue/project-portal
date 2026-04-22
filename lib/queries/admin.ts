import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { USE_MOCK } from "./_config";

/**
 * Admin-only queries. Every function here uses the service-role client and
 * therefore bypasses RLS. Callers MUST ensure the caller is a superadmin
 * before invoking (use `requireSuperadmin()` in the page or action).
 *
 * These functions short-circuit to empty / mock data when Supabase env vars
 * are missing, so the admin UI is renderable in local dev without creds.
 */

export interface AdminUserRow {
  /** auth.users.id — the canonical user identifier. */
  id: string;
  email: string;
  /** Full name from profiles. Null if profile never got one. */
  fullName: string | null;
  company: string | null;
  title: string | null;
  /** `profiles.role` — legacy role column on profiles; kept for display. */
  role: "admin" | "member" | "guest" | "readonly";
  isSuperadmin: boolean;
  /** True once they've clicked the confirmation email (or we skipped it). */
  emailConfirmed: boolean;
  /** True when they've been added to at least one project. */
  hasProjectAccess: boolean;
  /** How many projects they can currently see. */
  projectCount: number;
  /** ISO string or null. Never a Date object. */
  createdAt: string;
  lastSignInAt: string | null;
}

export interface AdminProjectRow {
  id: string;
  slug: string;
  name: string;
  customer: string;
}

/**
 * Richer list row used by the /admin/projects grid. Adds display-only fields
 * (phase, completion, milestones, member count). Cheap to compute — one extra
 * aggregate on project_members alongside the projects fetch.
 */
export interface AdminProjectListRow {
  id: string;
  slug: string;
  name: string;
  customer: string;
  customerRep: string | null;
  address: string | null;
  phase: "pre_con" | "design" | "construction" | "closeout";
  percentComplete: number;
  nextMilestone: string | null;
  nextMilestoneDate: string | null;
  memberCount: number;
  createdAt: string;
}

export interface AdminMembershipRow {
  id: string;
  projectId: string;
  projectSlug: string;
  projectName: string;
  role: "admin" | "member" | "guest" | "readonly";
}

export interface AdminUserDetail extends AdminUserRow {
  memberships: AdminMembershipRow[];
}

/** A single user's membership record in the context of one project. */
export interface AdminProjectMemberRow {
  /** project_members.id — use for update/revoke. */
  membershipId: string;
  userId: string;
  email: string;
  fullName: string | null;
  company: string | null;
  title: string | null;
  role: "admin" | "member" | "guest" | "readonly";
  isSuperadmin: boolean;
}

/** Full project detail for the admin edit screen. */
export interface AdminProjectDetail {
  id: string;
  slug: string;
  name: string;
  customer: string;
  customerRep: string | null;
  address: string | null;
  phase: "pre_con" | "design" | "construction" | "closeout";
  percentComplete: number;
  nextMilestone: string | null;
  nextMilestoneDate: string | null;
  createdAt: string;
  updatedAt: string;
  members: AdminProjectMemberRow[];
}

/** Slim user row used in project-member pickers. */
export interface AdminProfileLite {
  id: string;
  email: string;
  fullName: string | null;
  company: string | null;
  isSuperadmin: boolean;
}

/**
 * List every user in the system (auth.users joined with profiles + counts).
 *
 * We prefer a single admin.listUsers() call plus a parallel profiles +
 * project_members fetch — that way we don't N+1 the auth API. The auth
 * listUsers endpoint caps at 1000 per page; PE isn't anywhere close, so
 * we don't bother paginating yet.
 */
export async function listAllUsers(): Promise<AdminUserRow[]> {
  if (USE_MOCK) return [];

  const supabase = createAdminClient();

  const [usersRes, profilesRes, membersRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase
      .from("profiles")
      .select("id, full_name, company, title, role, is_superadmin"),
    supabase.from("project_members").select("user_id"),
  ]);

  if (usersRes.error) {
    throw new Error(`listAllUsers (auth): ${usersRes.error.message}`);
  }
  if (profilesRes.error) {
    throw new Error(`listAllUsers (profiles): ${profilesRes.error.message}`);
  }
  if (membersRes.error) {
    throw new Error(`listAllUsers (members): ${membersRes.error.message}`);
  }

  const profilesById = new Map<
    string,
    {
      full_name: string | null;
      company: string | null;
      title: string | null;
      role: "admin" | "member" | "guest" | "readonly";
      is_superadmin: boolean;
    }
  >();
  for (const p of profilesRes.data ?? []) {
    profilesById.set(p.id, {
      full_name: p.full_name ?? null,
      company: p.company ?? null,
      title: p.title ?? null,
      role: p.role,
      is_superadmin: Boolean(p.is_superadmin),
    });
  }

  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCounts.set(m.user_id, (memberCounts.get(m.user_id) ?? 0) + 1);
  }

  const rows: AdminUserRow[] = usersRes.data.users.map((u) => {
    const profile = profilesById.get(u.id);
    const projectCount = memberCounts.get(u.id) ?? 0;
    return {
      id: u.id,
      email: u.email ?? "",
      fullName: profile?.full_name ?? null,
      company: profile?.company ?? null,
      title: profile?.title ?? null,
      role: profile?.role ?? "member",
      isSuperadmin: profile?.is_superadmin ?? false,
      emailConfirmed: Boolean(u.email_confirmed_at),
      hasProjectAccess: projectCount > 0 || Boolean(profile?.is_superadmin),
      projectCount,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    };
  });

  // Stable ordering: superadmins first, then by created-at desc.
  rows.sort((a, b) => {
    if (a.isSuperadmin !== b.isSuperadmin) return a.isSuperadmin ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });

  return rows;
}

/** Every project in the system (admin-only, bypasses RLS). */
export async function listAllProjects(): Promise<AdminProjectRow[]> {
  if (USE_MOCK) return [];

  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, slug, name, customer")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`listAllProjects: ${error.message}`);
  return (data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    customer: p.customer,
  }));
}

/**
 * Full detail for one user: auth row, profile, and the list of projects
 * they're members of. Returns null when the user does not exist.
 */
export async function getUserDetail(
  userId: string,
): Promise<AdminUserDetail | null> {
  if (USE_MOCK) return null;

  const supabase = createAdminClient();

  const [userRes, profileRes, membersRes] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from("profiles")
      .select("full_name, company, title, role, is_superadmin")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .from("project_members")
      .select("id, role, project_id, projects!inner(id, slug, name)")
      .eq("user_id", userId),
  ]);

  if (userRes.error || !userRes.data.user) {
    // Not found — the admin API returns an error for unknown ids, which we
    // map to null so the page can render a 404.
    return null;
  }
  if (profileRes.error) {
    throw new Error(`getUserDetail (profile): ${profileRes.error.message}`);
  }
  if (membersRes.error) {
    throw new Error(`getUserDetail (members): ${membersRes.error.message}`);
  }

  const authUser = userRes.data.user;
  const profile = profileRes.data ?? null;

  // Supabase PostgREST types the nested `projects!inner(...)` relation as an
  // array when it can't prove it's one-to-one. The foreign key makes it
  // one-to-one; we normalize here.
  type MemberRowRaw = {
    id: string;
    role: "admin" | "member" | "guest" | "readonly";
    project_id: string;
    projects:
      | { id: string; slug: string; name: string }
      | { id: string; slug: string; name: string }[]
      | null;
  };

  const memberships: AdminMembershipRow[] = (
    (membersRes.data ?? []) as MemberRowRaw[]
  )
    .map((m) => {
      const proj = Array.isArray(m.projects) ? m.projects[0] : m.projects;
      if (!proj) return null;
      return {
        id: m.id,
        projectId: proj.id,
        projectSlug: proj.slug,
        projectName: proj.name,
        role: m.role,
      };
    })
    .filter((x): x is AdminMembershipRow => x !== null)
    .sort((a, b) => a.projectName.localeCompare(b.projectName));

  return {
    id: authUser.id,
    email: authUser.email ?? "",
    fullName: profile?.full_name ?? null,
    company: profile?.company ?? null,
    title: profile?.title ?? null,
    role: profile?.role ?? "member",
    isSuperadmin: Boolean(profile?.is_superadmin),
    emailConfirmed: Boolean(authUser.email_confirmed_at),
    hasProjectAccess: memberships.length > 0 || Boolean(profile?.is_superadmin),
    projectCount: memberships.length,
    createdAt: authUser.created_at,
    lastSignInAt: authUser.last_sign_in_at ?? null,
    memberships,
  };
}

// ---------------------------------------------------------------------------
// Projects — list + detail for the admin UI
// ---------------------------------------------------------------------------

/**
 * List every project with a member-count aggregate. Two parallel queries
 * (projects + project_members) that we stitch locally — cheaper than a SQL
 * aggregate + join given the small cardinality.
 */
export async function listProjectsWithStats(): Promise<AdminProjectListRow[]> {
  if (USE_MOCK) return [];

  const supabase = createAdminClient();

  const [projectsRes, membersRes] = await Promise.all([
    supabase
      .from("projects")
      .select(
        "id, slug, name, customer, customer_rep, address, phase, percent_complete, next_milestone, next_milestone_date, created_at",
      )
      .order("created_at", { ascending: false }),
    supabase.from("project_members").select("project_id"),
  ]);

  if (projectsRes.error) {
    throw new Error(`listProjectsWithStats (projects): ${projectsRes.error.message}`);
  }
  if (membersRes.error) {
    throw new Error(`listProjectsWithStats (members): ${membersRes.error.message}`);
  }

  const memberCounts = new Map<string, number>();
  for (const m of membersRes.data ?? []) {
    memberCounts.set(m.project_id, (memberCounts.get(m.project_id) ?? 0) + 1);
  }

  return (projectsRes.data ?? []).map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    customer: p.customer,
    customerRep: p.customer_rep ?? null,
    address: p.address ?? null,
    phase: p.phase,
    percentComplete: p.percent_complete ?? 0,
    nextMilestone: p.next_milestone ?? null,
    nextMilestoneDate: p.next_milestone_date ?? null,
    memberCount: memberCounts.get(p.id) ?? 0,
    createdAt: p.created_at,
  }));
}

/**
 * Full detail for one project: the row itself, plus the list of members
 * (joined against profiles + auth.users for display names / emails).
 * Returns null when the id doesn't resolve — page renders a 404.
 */
export async function getProjectDetail(
  projectId: string,
): Promise<AdminProjectDetail | null> {
  if (USE_MOCK) return null;

  const supabase = createAdminClient();

  // Project row first. If it's missing we can skip the members fetch.
  const { data: projectRow, error: projectErr } = await supabase
    .from("projects")
    .select(
      "id, slug, name, customer, customer_rep, address, phase, percent_complete, next_milestone, next_milestone_date, created_at, updated_at",
    )
    .eq("id", projectId)
    .maybeSingle();

  if (projectErr) {
    throw new Error(`getProjectDetail (project): ${projectErr.message}`);
  }
  if (!projectRow) return null;

  // Fetch members, profiles, and auth.users in parallel, then stitch.
  // We don't use PostgREST's nested `profiles!inner(...)` embed here because
  // there's no direct FK between `project_members` and `profiles` — both point
  // at `auth.users(id)`, which PostgREST can't auto-resolve into a join.
  const [membersRes, profilesRes, authUsersRes] = await Promise.all([
    supabase
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", projectId),
    supabase
      .from("profiles")
      .select("id, full_name, company, title, is_superadmin"),
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (membersRes.error) {
    throw new Error(`getProjectDetail (members): ${membersRes.error.message}`);
  }
  if (profilesRes.error) {
    throw new Error(`getProjectDetail (profiles): ${profilesRes.error.message}`);
  }
  if (authUsersRes.error) {
    throw new Error(`getProjectDetail (auth): ${authUsersRes.error.message}`);
  }

  const emailById = new Map<string, string>();
  for (const u of authUsersRes.data.users) {
    emailById.set(u.id, u.email ?? "");
  }

  const profileById = new Map<
    string,
    {
      full_name: string | null;
      company: string | null;
      title: string | null;
      is_superadmin: boolean;
    }
  >();
  for (const p of profilesRes.data ?? []) {
    profileById.set(p.id, {
      full_name: p.full_name ?? null,
      company: p.company ?? null,
      title: p.title ?? null,
      is_superadmin: Boolean(p.is_superadmin),
    });
  }

  const members: AdminProjectMemberRow[] = (membersRes.data ?? [])
    .map((m) => {
      const prof = profileById.get(m.user_id);
      return {
        membershipId: m.id,
        userId: m.user_id,
        email: emailById.get(m.user_id) ?? "",
        fullName: prof?.full_name ?? null,
        company: prof?.company ?? null,
        title: prof?.title ?? null,
        role: m.role as "admin" | "member" | "guest" | "readonly",
        isSuperadmin: Boolean(prof?.is_superadmin),
      };
    })
    .sort((a, b) => {
      // Admins first, then by name/email.
      if (a.role !== b.role) {
        const order = { admin: 0, member: 1, guest: 2, readonly: 3 } as const;
        return order[a.role] - order[b.role];
      }
      const an = (a.fullName ?? a.email).toLowerCase();
      const bn = (b.fullName ?? b.email).toLowerCase();
      return an.localeCompare(bn);
    });

  return {
    id: projectRow.id,
    slug: projectRow.slug,
    name: projectRow.name,
    customer: projectRow.customer,
    customerRep: projectRow.customer_rep ?? null,
    address: projectRow.address ?? null,
    phase: projectRow.phase,
    percentComplete: projectRow.percent_complete ?? 0,
    nextMilestone: projectRow.next_milestone ?? null,
    nextMilestoneDate: projectRow.next_milestone_date ?? null,
    createdAt: projectRow.created_at,
    updatedAt: projectRow.updated_at,
    members,
  };
}

/**
 * Slim list of every user + their email for the member picker on the
 * project detail page. Parallel pattern mirrors listAllUsers().
 */
export async function listAllProfilesLite(): Promise<AdminProfileLite[]> {
  if (USE_MOCK) return [];

  const supabase = createAdminClient();

  const [usersRes, profilesRes] = await Promise.all([
    supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabase.from("profiles").select("id, full_name, company, is_superadmin"),
  ]);

  if (usersRes.error) {
    throw new Error(`listAllProfilesLite (auth): ${usersRes.error.message}`);
  }
  if (profilesRes.error) {
    throw new Error(`listAllProfilesLite (profiles): ${profilesRes.error.message}`);
  }

  const profilesById = new Map<
    string,
    { full_name: string | null; company: string | null; is_superadmin: boolean }
  >();
  for (const p of profilesRes.data ?? []) {
    profilesById.set(p.id, {
      full_name: p.full_name ?? null,
      company: p.company ?? null,
      is_superadmin: Boolean(p.is_superadmin),
    });
  }

  return usersRes.data.users.map((u) => {
    const prof = profilesById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      fullName: prof?.full_name ?? null,
      company: prof?.company ?? null,
      isSuperadmin: Boolean(prof?.is_superadmin),
    };
  });
}
