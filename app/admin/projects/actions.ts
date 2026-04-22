"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperadmin } from "@/lib/auth/user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * # Project admin server actions
 *
 * Parallel to `app/admin/actions.ts` but scoped to the projects table. Every
 * action starts with `await requireSuperadmin()` — that's the fence between
 * the browser and the service-role client used to mutate the row.
 *
 * Same return contract as the user actions:
 *   - `{ ok: true }` on success
 *   - `{ ok: false, error: string }` on user-visible failure (duplicate slug,
 *     validation miss, FK violation, …)
 *   - Unexpected errors throw — Next's error boundary handles them.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

type Phase = "pre_con" | "design" | "construction" | "closeout";
const PHASES: Phase[] = ["pre_con", "design", "construction", "closeout"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fieldString(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function fieldOptional(formData: FormData, name: string): string | null {
  const v = fieldString(formData, name);
  return v === "" ? null : v;
}

function fieldPercent(formData: FormData, name: string): number {
  const v = fieldString(formData, name);
  if (!v) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function fieldDate(formData: FormData, name: string): string | null {
  const v = fieldString(formData, name);
  if (!v) return null;
  // Basic ISO-ish guard; Supabase will reject anything it can't parse.
  if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return null;
  return v;
}

/**
 * Slug rules — lowercase alphanumerics, dashes, and underscores. We let the
 * operator pick anything that looks URL-safe (most PE projects use the 4-digit
 * job number like "1646"). The unique constraint is the real authority;
 * validation here just catches obvious typos.
 */
const SLUG_RE = /^[a-z0-9][a-z0-9_-]*$/;

function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug) && slug.length <= 64;
}

function isPhase(p: string): p is Phase {
  return PHASES.includes(p as Phase);
}

/**
 * Supabase duplicate-key errors come back as Postgres code 23505. The
 * `error.message` is machine-ugly; we translate to something friendly.
 */
function isDuplicateSlugError(err: { code?: string; message?: string }): boolean {
  return err.code === "23505" && (err.message ?? "").includes("slug");
}

// ---------------------------------------------------------------------------
// Create a project
// ---------------------------------------------------------------------------

/**
 * Fields on the FormData:
 *   - name (required)
 *   - slug (required, URL-safe)
 *   - customer (required)
 *   - customerRep, address, nextMilestone (optional)
 *   - phase (pre_con | design | construction | closeout, default pre_con)
 *   - percentComplete (0-100, default 0)
 *   - nextMilestoneDate (YYYY-MM-DD or blank)
 *
 * On success redirects into the detail page so the operator lands where
 * they'll naturally want to be next (adding project members).
 */
export async function createProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const name = fieldString(formData, "name");
  const slug = fieldString(formData, "slug").toLowerCase();
  const customer = fieldString(formData, "customer");
  const customerRep = fieldOptional(formData, "customerRep");
  const address = fieldOptional(formData, "address");
  const phaseRaw = fieldString(formData, "phase") || "pre_con";
  const percentComplete = fieldPercent(formData, "percentComplete");
  const nextMilestone = fieldOptional(formData, "nextMilestone");
  const nextMilestoneDate = fieldDate(formData, "nextMilestoneDate");

  if (!name) return { ok: false, error: "Project name is required." };
  if (!slug) return { ok: false, error: "Slug / project number is required." };
  if (!isValidSlug(slug))
    return {
      ok: false,
      error:
        "Slug must start with a letter or number and contain only lowercase letters, numbers, dashes, or underscores.",
    };
  if (!customer) return { ok: false, error: "Customer is required." };
  if (!isPhase(phaseRaw))
    return { ok: false, error: "Phase is not valid." };

  const admin = createAdminClient();

  const { data, error } = await admin
    .from("projects")
    .insert({
      name,
      slug,
      customer,
      customer_rep: customerRep,
      address,
      phase: phaseRaw,
      percent_complete: percentComplete,
      next_milestone: nextMilestone,
      next_milestone_date: nextMilestoneDate,
    })
    .select("id")
    .single();

  if (error) {
    if (isDuplicateSlugError(error)) {
      return {
        ok: false,
        error: `Project number "${slug}" is already in use. Pick another.`,
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath("/admin/projects");
  revalidatePath("/");
  redirect(`/admin/projects/${data.id}`);
}

// ---------------------------------------------------------------------------
// Update a project
// ---------------------------------------------------------------------------

export async function updateProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const projectId = fieldString(formData, "projectId");
  if (!projectId) return { ok: false, error: "Project id missing." };

  const name = fieldString(formData, "name");
  const slug = fieldString(formData, "slug").toLowerCase();
  const customer = fieldString(formData, "customer");
  const customerRep = fieldOptional(formData, "customerRep");
  const address = fieldOptional(formData, "address");
  const phaseRaw = fieldString(formData, "phase");
  const percentComplete = fieldPercent(formData, "percentComplete");
  const nextMilestone = fieldOptional(formData, "nextMilestone");
  const nextMilestoneDate = fieldDate(formData, "nextMilestoneDate");

  if (!name) return { ok: false, error: "Project name is required." };
  if (!slug) return { ok: false, error: "Slug / project number is required." };
  if (!isValidSlug(slug))
    return {
      ok: false,
      error:
        "Slug must start with a letter or number and contain only lowercase letters, numbers, dashes, or underscores.",
    };
  if (!customer) return { ok: false, error: "Customer is required." };
  if (!isPhase(phaseRaw))
    return { ok: false, error: "Phase is not valid." };

  const admin = createAdminClient();

  const { error } = await admin
    .from("projects")
    .update({
      name,
      slug,
      customer,
      customer_rep: customerRep,
      address,
      phase: phaseRaw,
      percent_complete: percentComplete,
      next_milestone: nextMilestone,
      next_milestone_date: nextMilestoneDate,
    })
    .eq("id", projectId);

  if (error) {
    if (isDuplicateSlugError(error)) {
      return {
        ok: false,
        error: `Project number "${slug}" is already in use by another project.`,
      };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/admin/projects/${projectId}`);
  revalidatePath("/admin/projects");
  revalidatePath(`/projects/${slug}`);
  revalidatePath("/");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Delete a project
// ---------------------------------------------------------------------------

/**
 * Cascades:
 *  - project_members FK on delete cascade → membership rows removed.
 *  - files / schedule_activities / submittals / rfis / chat_subjects /
 *    chat_messages / updates all FK-cascade from `projects(id)` per the
 *    initial schema. R2 objects are NOT cleaned up — we only store the key
 *    in the DB; a future janitor process can sweep orphaned objects.
 */
export async function deleteProjectAction(
  formData: FormData,
): Promise<ActionResult> {
  await requireSuperadmin();

  const projectId = fieldString(formData, "projectId");
  if (!projectId) return { ok: false, error: "Project id missing." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/projects");
  revalidatePath("/");
  redirect("/admin/projects");
}
