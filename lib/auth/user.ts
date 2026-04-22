import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Re-exported from the client-safe module so existing server-side callers
// (which do `import { getCurrentUser, initialsFor } from "@/lib/auth/user"`)
// keep working. Client components should import `initialsFor` directly
// from `@/lib/auth/initials` — this file is `server-only`.
export { initialsFor } from "./initials";

/**
 * # Auth helpers — the one place server components ask "who's logged in?"
 *
 * Every server component / route handler / server action that needs to know
 * about the current user should go through `getCurrentUser()` here. Don't
 * roll your own `supabase.auth.getUser()` in a page file — you'll end up
 * doing an extra round-trip per render path, and the shape of "the user +
 * their profile" will drift between files.
 *
 * Shape we hand back:
 *
 *   {
 *     user:          Supabase auth user (id, email, etc.) or null
 *     profile:       our `profiles` row (full_name, company, is_superadmin…)
 *     isSuperadmin:  convenience boolean pulled off the profile
 *   }
 *
 * Why `cache()`:
 *   React's request-scoped cache. When five different server components on
 *   the same page all call `getCurrentUser()`, we hit Supabase once per
 *   request, not five times. The cache is cleared between requests, so
 *   there's no leakage between users.
 *
 * Not-logged-in behavior:
 *   `getCurrentUser()` returns `{ user: null, profile: null, isSuperadmin: false }`.
 *   Callers decide what to do with that — render a public view, redirect,
 *   whatever. `requireUser()` is the strict version: it redirects to
 *   `/login?next=<path>` if there's no session, and is the right choice
 *   for any page that has no public state.
 */

export interface AppUser {
  /** Auth-layer identity (from Supabase auth.users). */
  user: {
    id: string;
    email: string | null;
  } | null;
  /** Profile row from our `profiles` table. Null if auth user exists but no profile yet. */
  profile: ProfileRow | null;
  /** Convenience: profile.is_superadmin, defaulted to false when missing. */
  isSuperadmin: boolean;
}

export interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
  role: "admin" | "member" | "guest" | "readonly";
  company: string | null;
  title: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
}

/**
 * Fetch the current user + profile. Cached per-request.
 *
 * Returns an AppUser with `user: null` when there's no session — this is
 * not an error, it's just "anonymous." Callers that require a session
 * should use `requireUser()` or branch on `user === null` themselves.
 */
export const getCurrentUser = cache(async (): Promise<AppUser> => {
  const supabase = createClient();

  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !authUser) {
    return { user: null, profile: null, isSuperadmin: false };
  }

  // Pull the profile row. We do this explicitly (rather than relying on a
  // Supabase join) because we often want profile even when a downstream
  // query doesn't need auth.users.
  const { data: profileData, error: profileError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, email, role, company, title, avatar_url, is_superadmin",
    )
    .eq("id", authUser.id)
    .maybeSingle<ProfileRow>();

  if (profileError) {
    // Don't throw — a missing/unreadable profile shouldn't 500 the page.
    // We surface what we know (auth user id + email) and mark no profile.
    // The caller can decide whether to show an "account-not-provisioned"
    // screen or let the render fall back.
    // eslint-disable-next-line no-console
    console.error("[auth] Failed to load profile:", profileError.message);
    return {
      user: { id: authUser.id, email: authUser.email ?? null },
      profile: null,
      isSuperadmin: false,
    };
  }

  return {
    user: { id: authUser.id, email: authUser.email ?? null },
    profile: profileData ?? null,
    isSuperadmin: profileData?.is_superadmin ?? false,
  };
});

/**
 * Strict variant: redirects to /login when there's no session.
 *
 * Use in pages/routes where anonymous traffic makes no sense. The
 * middleware already bounces unauthenticated traffic from protected paths,
 * so this is belt-and-braces — useful inside server actions or API routes
 * where middleware alone isn't enough.
 *
 * The caller always gets a non-null user; a missing profile is still
 * possible (hence profile stays `ProfileRow | null`).
 */
export async function requireUser(
  redirectTo: string = "/login",
): Promise<{
  user: NonNullable<AppUser["user"]>;
  profile: ProfileRow | null;
  isSuperadmin: boolean;
}> {
  const me = await getCurrentUser();
  if (!me.user) {
    redirect(redirectTo);
  }
  return {
    user: me.user,
    profile: me.profile,
    isSuperadmin: me.isSuperadmin,
  };
}

/**
 * Even stricter: require a superadmin. Redirects to `/` (the dashboard) on
 * failure — dropping someone on /login would feel wrong since they *are*
 * logged in, just not privileged enough.
 *
 * Use on platform-admin-only surfaces: the eventual /admin/members page,
 * cross-project settings, bulk actions, etc.
 */
export async function requireSuperadmin(
  redirectOnFail: string = "/",
): Promise<{
  user: NonNullable<AppUser["user"]>;
  profile: ProfileRow;
}> {
  const me = await requireUser();
  if (!me.isSuperadmin || !me.profile) {
    redirect(redirectOnFail);
  }
  return { user: me.user, profile: me.profile };
}

// `initialsFor` lives in `./initials` (client-safe) and is re-exported
// at the top of this file.
