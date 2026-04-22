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
