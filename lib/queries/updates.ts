import "server-only";
import type { Update } from "@/data/types";
import { updates as mockUpdates } from "@/data/updates";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

interface UpdateRow {
  id: string;
  title: string;
  body: string | null;
  kind: "oac_recap" | "weekly" | "phase_kickoff" | "safety" | "general";
  published_at: string;
  // One-to-one join to profiles via author_id. PostgREST may return this as
  // an object or a single-element array; handle both.
  profiles:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
}

const kindLabel: Record<UpdateRow["kind"], Update["type"]> = {
  oac_recap: "OAC Recap",
  weekly: "Weekly",
  phase_kickoff: "Phase Kickoff",
  safety: "Safety",
  general: "Weekly", // fall back to Weekly for generic posts
};

/**
 * List updates (PM-authored posts) for a project.
 *
 * Now joins `profiles` via `author_id` so the author display name is populated
 * without a second round-trip. `likes`, `commentCount`, and `attachments` are
 * still placeholders — those tables don't exist yet.
 */
export async function getUpdates(slug: string): Promise<Update[]> {
  if (USE_MOCK) return mockUpdates;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("updates")
    .select(
      `
      id,
      title,
      body,
      kind,
      published_at,
      profiles:author_id (
        full_name,
        email
      )
    `,
    )
    .eq("project_id", projectId)
    .order("published_at", { ascending: false });

  if (error) throw new Error(`getUpdates failed: ${error.message}`);

  const rows = (data ?? []) as unknown as UpdateRow[];

  return rows.map((row): Update => {
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0]
      : row.profiles;
    const author = profile
      ? (profile.full_name ?? profile.email)
      : "";

    return {
      id: row.id,
      type: kindLabel[row.kind],
      title: row.title,
      body: row.body ?? "",
      author,
      postedDate: row.published_at.slice(0, 10),
      postedTime: row.published_at.slice(11, 16),
      likes: 0,
      commentCount: 0,
    };
  });
}
