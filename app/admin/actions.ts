"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * # Admin server actions
 *
 * Every action here is gated with `await requireSuperadmin()` as the first
 * statement. That's the fence — if it passes, the caller is a superadmin
 * and we're allowed to use the service-role client for privileged writes.
 *
 * The service role bypasses RLS, so `requireSuperadmin()` is the only thing
 * between these mutations and the database. Don't skip it. Don't refactor
 * it away. Don't expose any of these functions to a client component that
 * could be invoked from the browser without going through the server action
 * boundary.
 *
 * Actions return `{ ok: true }` on success or `{ ok: false, error: string }`
 * on user-visible failure. Unexpected errors (bugs) are allowed to throw;
 * Next's error boundary will render the closest error.tsx.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldString(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function fieldBool(formData: FormData, name: string): boolean {
  const v = formData.get(name);
  return v === "on" || v === "true" || v === "1";
}

function isValidEmail(email: string): boolean {
  // Intentionally permissive — Supabase does the authoritative validation
  // on the back end. We just want to catch obvious typos client-side.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------------------------------------------------------------------------
// Create a new user
// ---------------------------------------------------------------------------

/**
 * Creates an auth.users row + a matching profiles row.
 *
 * Fields on the FormData:
 *   - email (required)
 *   - password (required, >= 8 chars)
 *   - fullName (optional)
 *   - company (optional)
 *   - title (optional)
 *   - sendWelcome ("on" → skip confirm email and deliver a welcome/magic link)
 *
 * By default we create with `email_confirm: true` so the user can sign in
 * immediately with the password we set. No email is sent.
 */
export async function createUserAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const email = fieldString(formData, "email").toLowerCase();
  const password = fieldString(formData, "password");
  const fullName = fieldString(formData, "fullName") || null;
  const company = fieldString(formData, "company") || null;
  const title = fieldString(formData, "title") || null;

  if (!email) return { ok: false, error: "Email is required." };
  if (!isValidEmail(email)) return { ok: false, error: "Email is not valid." };
  if (!password)
    return { ok: false, error: "Password is required." };
  if (password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };

  const admin = createAdminClient();

  const { data: created, error: createErr } = await admin.auth.admin.createUser(
    {
      email,
      password,
      email_confirm: true,
      user_metadata: fullName ? { full_name: fullName } : undefined,
    },
  );

  if (createErr || !created.user) {
    return {
      ok: false,
      error: createErr?.message ?? "Failed to create user.",
    };
  }

  // Upsert matching profile row. The trigger/handler may already insert one
  // (depends on your Supabase config), so we use upsert to be idempotent.
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: created.user.id,
      email,
      full_name: fullName,
      company,
      title,
    },
    { onConflict: "id" },
  );

  if (profileErr) {
    // Roll back the auth user so we don't leave orphans behind.
    await admin.auth.admin.deleteUser(created.user.id);
    return { ok: false, error: `Profile insert failed: ${profileErr.message}` };
  }

  revalidatePath("/admin/users");
  redirect(`/admin/users/${created.user.id}`);
}

// ---------------------------------------------------------------------------
// Update basic profile fields
// ---------------------------------------------------------------------------

export async function updateProfileAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  if (!userId) return { ok: false, error: "User id missing." };

  const fullName = fieldString(formData, "fullName") || null;
  const company = fieldString(formData, "company") || null;
  const title = fieldString(formData, "title") || null;

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ full_name: fullName, company, title })
    .eq("id", userId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Set / reset password
// ---------------------------------------------------------------------------

export async function setPasswordAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  const password = fieldString(formData, "password");

  if (!userId) return { ok: false, error: "User id missing." };
  if (!password) return { ok: false, error: "Password is required." };
  if (password.length < 8)
    return { ok: false, error: "Password must be at least 8 characters." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Confirm a pending signup (skip email confirmation)
// ---------------------------------------------------------------------------

export async function confirmEmailAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  if (!userId) return { ok: false, error: "User id missing." };

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Toggle superadmin flag
// ---------------------------------------------------------------------------

export async function setSuperadminAction(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  const on = fieldBool(formData, "on");

  if (!userId) return { ok: false, error: "User id missing." };

  // Safety rail: don't let the only superadmin demote themselves. At least
  // one must remain — otherwise nobody can recover without a DB console.
  if (!on && userId === me.user.id) {
    const admin = createAdminClient();
    const { count, error } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("is_superadmin", true);
    if (error) return { ok: false, error: error.message };
    if ((count ?? 0) <= 1) {
      return {
        ok: false,
        error:
          "Can't remove the last superadmin. Promote another user first.",
      };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ is_superadmin: on })
    .eq("id", userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Project access — grant / update role / revoke
// ---------------------------------------------------------------------------

export async function grantProjectAccessAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  const projectId = fieldString(formData, "projectId");
  const role = fieldString(formData, "role") || "member";

  if (!userId) return { ok: false, error: "User id missing." };
  if (!projectId) return { ok: false, error: "Project id missing." };
  if (!["admin", "member", "guest", "readonly"].includes(role)) {
    return { ok: false, error: "Role is not valid." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("project_members").upsert(
    {
      project_id: projectId,
      user_id: userId,
      role: role as "admin" | "member" | "guest" | "readonly",
      accepted_at: new Date().toISOString(),
    },
    { onConflict: "project_id,user_id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateMembershipRoleAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  const membershipId = fieldString(formData, "membershipId");
  const role = fieldString(formData, "role");

  if (!userId) return { ok: false, error: "User id missing." };
  if (!membershipId) return { ok: false, error: "Membership id missing." };
  if (!["admin", "member", "guest", "readonly"].includes(role)) {
    return { ok: false, error: "Role is not valid." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("project_members")
    .update({ role: role as "admin" | "member" | "guest" | "readonly" })
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  return { ok: true };
}

export async function revokeProjectAccessAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  const membershipId = fieldString(formData, "membershipId");

  if (!userId) return { ok: false, error: "User id missing." };
  if (!membershipId) return { ok: false, error: "Membership id missing." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("project_members")
    .delete()
    .eq("id", membershipId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/users/${userId}`);
  revalidatePath("/admin/users");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete user
// ---------------------------------------------------------------------------

export async function deleteUserAction(
  formData: FormData,
): Promise<ActionResult> {
  const me = await requireSuperadmin();

  const userId = fieldString(formData, "userId");
  if (!userId) return { ok: false, error: "User id missing." };

  if (userId === me.user.id) {
    return { ok: false, error: "You can't delete your own account." };
  }

  const admin = createAdminClient();

  // Deleting the auth user cascades project_members (FK on delete cascade)
  // and profiles (FK on delete cascade). One call clears everything.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  redirect("/admin/users");
}
