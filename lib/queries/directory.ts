import "server-only";
import type { DirectoryEntry } from "@/data/types";
import { directory as mockDirectory } from "@/data/directory";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

/**
 * Row shape returned by the join below. Supabase's PostgREST returns joined
 * one-to-one relations as a nested object when the FK is unique/unambiguous;
 * when the relation is ambiguous it comes back as an array. We defensively
 * normalize both shapes.
 */
interface MemberRow {
  role: "admin" | "member" | "guest" | "readonly";
  profiles:
    | {
        id: string;
        full_name: string | null;
        email: string;
        company: string | null;
        title: string | null;
      }
    | {
        id: string;
        full_name: string | null;
        email: string;
        company: string | null;
        title: string | null;
      }[]
    | null;
}

const roleToStatus: Record<
  MemberRow["role"],
  DirectoryEntry["status"]
> = {
  admin: "Admin",
  member: "Member",
  guest: "Guest",
  // No direct enum match — display as Guest (read-only project members are
  // still external participants from an access-control standpoint).
  readonly: "Guest",
};

/**
 * List directory entries for a project.
 *
 * Live mode joins `project_members` to `profiles`, so the UI gets the person's
 * name, email, company, and title without a second round-trip. The RLS policy
 * on `project_members` already limits visibility to fellow project members, so
 * this is safe to serve without additional filtering.
 *
 * Falls back to mock when `USE_MOCK` or when the project slug is unknown —
 * the page will still render meaningful content during dev.
 */
export async function getDirectory(slug: string): Promise<DirectoryEntry[]> {
  if (USE_MOCK) return mockDirectory;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data, error } = await supabase
    .from("project_members")
    .select(
      `
      role,
      profiles:user_id (
        id,
        full_name,
        email,
        company,
        title
      )
    `,
    )
    .eq("project_id", projectId);

  if (error) throw new Error(`getDirectory failed: ${error.message}`);

  const rows = (data ?? []) as unknown as MemberRow[];

  return rows
    .map((row): DirectoryEntry | null => {
      // Normalize nested-or-array shape from PostgREST.
      const profile = Array.isArray(row.profiles)
        ? row.profiles[0]
        : row.profiles;
      if (!profile) return null;

      return {
        id: profile.id,
        name: profile.full_name ?? profile.email,
        role: profile.title ?? "",
        organization: profile.company ?? "",
        email: profile.email,
        status: roleToStatus[row.role],
      };
    })
    .filter((entry): entry is DirectoryEntry => entry !== null);
}
