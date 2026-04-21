import "server-only";
import type { Submittal, RFI } from "@/data/types";
import { submittals as mockSubmittals, rfis as mockRfis } from "@/data/submittals";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

type OwnerProfile = { full_name: string | null; email: string } | null;

interface RoutingStepRow {
  step_order: number;
  role: "admin" | "member" | "guest" | "readonly" | null;
  profiles:
    | { company: string | null; full_name: string | null }
    | { company: string | null; full_name: string | null }[]
    | null;
}

interface SubmittalRow {
  id: string;
  number: string;
  title: string;
  spec_section: string | null;
  submitted_date: string | null;
  due_date: string | null;
  status: "draft" | "submitted" | "in_review" | "approved" | "revise_resubmit" | "rejected";
  profiles: OwnerProfile | OwnerProfile[]; // owner (user_id) join
  submittal_routing_steps: RoutingStepRow[] | null;
}

const submittalStatusLabel: Record<SubmittalRow["status"], Submittal["status"]> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  approved: "Approved",
  revise_resubmit: "Revise & Resubmit",
  rejected: "Rejected",
};

const roleLabel: Record<NonNullable<RoutingStepRow["role"]>, string> = {
  admin: "Admin",
  member: "Member",
  guest: "Guest",
  readonly: "Reviewer",
};

/**
 * Flatten a routing-step row into the short display label we show in the
 * stepper. Prefer company name when we have it (e.g. "BCER", "Wember"),
 * otherwise fall back to the role. Never returns empty string.
 */
function labelForStep(step: RoutingStepRow): string {
  const profile = Array.isArray(step.profiles) ? step.profiles[0] : step.profiles;
  if (profile?.company) return profile.company;
  if (step.role) return roleLabel[step.role];
  return "—";
}

/**
 * List submittals for a project.
 *
 * Live mode now joins:
 *   • profiles (via owner) → owner display name
 *   • submittal_routing_steps (one-to-many) → routing[] label chain
 *
 * Routing labels prefer the assignee's company name so the stepper reads like
 * "PE → BCER → Wember"; we fall back to the step's role when no profile is
 * attached. Steps are sorted by `step_order` ascending.
 */
export async function getSubmittals(slug: string): Promise<Submittal[]> {
  if (USE_MOCK) return mockSubmittals;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("submittals")
    .select(
      `
      id,
      number,
      title,
      spec_section,
      submitted_date,
      due_date,
      status,
      profiles:owner (
        full_name,
        email
      ),
      submittal_routing_steps (
        step_order,
        role,
        profiles:assignee (
          company,
          full_name
        )
      )
    `,
    )
    .eq("project_id", projectId)
    .order("submitted_date", { ascending: false });

  if (error) throw new Error(`getSubmittals failed: ${error.message}`);

  const rows = (data ?? []) as unknown as SubmittalRow[];

  return rows.map((row): Submittal => {
    const ownerProfile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    const owner = ownerProfile
      ? (ownerProfile.full_name ?? ownerProfile.email)
      : "";

    const steps = (row.submittal_routing_steps ?? [])
      .slice()
      .sort((a, b) => a.step_order - b.step_order);
    const routing = steps.map(labelForStep);

    return {
      number: row.number,
      title: row.title,
      specSection: row.spec_section ?? "",
      submittedDate: row.submitted_date ?? "",
      dueDate: row.due_date ?? "",
      owner,
      status: submittalStatusLabel[row.status],
      routing,
    };
  });
}

interface RfiRow {
  id: string;
  number: string;
  question: string | null;
  opened_date: string | null;
  due_date: string | null;
  assigned_org: string | null;
  status: "open" | "answered" | "closed";
  profiles:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
}

const rfiStatusLabel: Record<RfiRow["status"], RFI["status"]> = {
  open: "Open",
  answered: "Answered",
  closed: "Closed",
};

/**
 * List RFIs for a project.
 *
 * Joins profiles via `assigned_to` so `assignedTo` gets a display name.
 */
export async function getRfis(slug: string): Promise<RFI[]> {
  if (USE_MOCK) return mockRfis;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("rfis")
    .select(
      `
      id,
      number,
      question,
      opened_date,
      due_date,
      assigned_org,
      status,
      profiles:assigned_to (
        full_name,
        email
      )
    `,
    )
    .eq("project_id", projectId)
    .order("opened_date", { ascending: false });

  if (error) throw new Error(`getRfis failed: ${error.message}`);

  const rows = (data ?? []) as unknown as RfiRow[];

  return rows.map((row): RFI => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const assignedTo = profile ? (profile.full_name ?? profile.email) : "";

    return {
      number: row.number,
      question: row.question ?? "",
      openedDate: row.opened_date ?? "",
      dueDate: row.due_date ?? "",
      assignedTo,
      assignedOrg: row.assigned_org ?? "",
      status: rfiStatusLabel[row.status],
    };
  });
}
