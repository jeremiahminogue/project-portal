import "server-only";
import type { Project } from "@/data/types";
import { projects as mockProjects } from "@/data/projects";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";

/**
 * Row shape returned by Supabase `projects` table.
 * Kept local so `data/types.ts` stays the view-layer contract.
 */
interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  customer: string;
  customer_rep: string | null;
  address: string | null;
  phase: "pre_con" | "design" | "construction" | "closeout";
  percent_complete: number | null;
  next_milestone: string | null;
  next_milestone_date: string | null;
}

const phaseToStatus: Record<ProjectRow["phase"], Project["status"]> = {
  pre_con: "Pre-Con",
  design: "Design",
  construction: "Construction",
  closeout: "Closed",
};

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.slug,
    number: `#${row.slug}`,
    title: row.name,
    address: row.address ?? "",
    owner: row.customer,
    status: phaseToStatus[row.phase],
    completionPercent: row.percent_complete ?? 0,
    targetComplete: "",
    nextMilestone: row.next_milestone ?? "",
    nextMilestoneDate: row.next_milestone_date ?? "",
    // Aggregates: not on `projects` row — filled by separate queries when we
    // swap pages. Mock values preserved for now.
    openSubmittals: 0,
    openRfis: 0,
    actionItems: 0,
    lastActivity: "",
    lastActivityTime: "",
    lastActivityAuthor: "",
  };
}

/** List projects visible to the current user. RLS-gated. */
export async function getProjects(): Promise<Project[]> {
  if (USE_MOCK) return mockProjects;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, slug, name, customer, customer_rep, address, phase, percent_complete, next_milestone, next_milestone_date",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`getProjects failed: ${error.message}`);
  return (data ?? []).map(rowToProject);
}

/** Fetch a single project by slug (the URL segment, e.g. "1646"). */
export async function getProject(slug: string): Promise<Project | null> {
  if (USE_MOCK) return mockProjects.find((p) => p.id === slug) ?? null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select(
      "id, slug, name, customer, customer_rep, address, phase, percent_complete, next_milestone, next_milestone_date",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`getProject failed: ${error.message}`);
  return data ? rowToProject(data) : null;
}

/**
 * Resolve a slug to the Supabase UUID. Most child-table queries key off the
 * internal UUID, not the slug. Returns null in mock mode (callers must
 * special-case mock there too — but in practice mock queries key off slug).
 */
export async function getProjectId(slug: string): Promise<string | null> {
  if (USE_MOCK) return slug;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (error) throw new Error(`getProjectId failed: ${error.message}`);
  return data?.id ?? null;
}
