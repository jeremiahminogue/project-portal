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
  author_id: string | null;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  email: string;
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
 * `updates.author_id` FKs to `auth.users(id)` — NOT `profiles(id)` — so
 * PostgREST cannot auto-embed profiles via the `profiles:author_id(...)`
 * shorthand. We fetch both tables and stitch in memory.
 * (Same pattern we use in lib/queries/admin.ts for project_members ↔ profiles.)
 *
 * Profile visibility: the default profiles RLS policy only lets users read
 * their own row, so non-superadmin viewers may not resolve every author. When
 * the stitch fails, `author` falls back to an empty string and the UI shows
 * the post without a name — never an error.
 */
export async function getUpdates(slug: string): Promise<Update[]> {
  if (USE_MOCK) return mockUpdates;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data: updateRows, error: updatesError } = await supabase
    .from("updates")
    .select("id, title, body, kind, published_at, author_id")
    .eq("project_id", projectId)
    .order("published_at", { ascending: false });

  if (updatesError) {
    throw new Error(`getUpdates failed: ${updatesError.message}`);
  }

  const rows = (updateRows ?? []) as UpdateRow[];
  if (rows.length === 0) return [];

  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_id).filter((id): id is string => !!id)),
  );

  const profilesById = new Map<string, ProfileRow>();
  if (authorIds.length > 0) {
    const { data: profileRows, error: profilesError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", authorIds);

    if (profilesError) {
      throw new Error(
        `getUpdates profiles stitch failed: ${profilesError.message}`,
      );
    }

    for (const p of (profileRows ?? []) as ProfileRow[]) {
      profilesById.set(p.id, p);
    }
  }

  return rows.map((row): Update => {
    const profile = row.author_id ? profilesById.get(row.author_id) : undefined;
    const author = profile ? (profile.full_name ?? profile.email) : "";

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
