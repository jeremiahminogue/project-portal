import "server-only";
import type { FileEntry, FolderEntry } from "@/data/types";
import { files as mockFiles, folders as mockFolders } from "@/data/files";
import { createClient } from "@/lib/supabase/server";
import { USE_MOCK } from "./_config";
import { getProjectId } from "./projects";

interface FileRow {
  id: string;
  name: string;
  is_folder: boolean;
  size_bytes: number | null;
  mime_type: string | null;
  updated_at: string;
  tags: string[] | null;
  parent_folder_id: string | null;
  profiles:
    | { full_name: string | null; email: string }
    | { full_name: string | null; email: string }[]
    | null;
}

function mimeToType(mime: string | null): FileEntry["type"] {
  if (!mime) return "pdf";
  if (mime.startsWith("image/")) return "image";
  if (mime.includes("pdf")) return "pdf";
  if (mime.includes("word") || mime.includes("officedocument.wordprocessingml")) return "docx";
  if (mime.includes("excel") || mime.includes("spreadsheetml")) return "xlsx";
  return "pdf";
}

function formatSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * List files (non-folder rows) for a project.
 *
 * Joins `profiles` via `uploaded_by` so the `uploadedBy` display name is
 * populated. `path` is derived from the parent folder name when present —
 * the UI currently filters by `path.startsWith("Meeting Notes/")`, so a
 * meaningful path matters here.
 */
export async function getFiles(slug: string): Promise<FileEntry[]> {
  if (USE_MOCK) return mockFiles;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  // Build a folder-name lookup in one round-trip so we can assemble paths
  // without a per-row join.
  const { data: folderRows, error: folderErr } = await supabase
    .from("files")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("is_folder", true);

  if (folderErr) throw new Error(`getFiles (folders) failed: ${folderErr.message}`);

  const folderNameById = new Map<string, string>();
  for (const f of folderRows ?? []) folderNameById.set(f.id, f.name);

  const { data, error } = await supabase
    .from("files")
    .select(
      `
      id,
      name,
      is_folder,
      size_bytes,
      mime_type,
      updated_at,
      tags,
      parent_folder_id,
      profiles:uploaded_by (
        full_name,
        email
      )
    `,
    )
    .eq("project_id", projectId)
    .eq("is_folder", false)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`getFiles failed: ${error.message}`);

  const rows = (data ?? []) as unknown as FileRow[];

  return rows.map((row): FileEntry => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const uploadedBy = profile ? (profile.full_name ?? profile.email) : "";

    const folderName = row.parent_folder_id
      ? folderNameById.get(row.parent_folder_id)
      : null;
    const path = folderName ? `${folderName}/${row.name}` : row.name;

    return {
      id: row.id,
      name: row.name,
      path,
      size: formatSize(row.size_bytes),
      type: mimeToType(row.mime_type),
      updatedAt: row.updated_at,
      uploadedBy,
      tags: row.tags ?? undefined,
    };
  });
}

/**
 * List folders (parent rows) for a project, with an accurate `fileCount` per
 * folder. Two queries today; could become a view if the table grows.
 */
export async function getFolders(slug: string): Promise<FolderEntry[]> {
  if (USE_MOCK) return mockFolders;

  const supabase = createClient();
  const projectId = await getProjectId(slug);
  if (!projectId) return [];

  const { data: folderRows, error: folderErr } = await supabase
    .from("files")
    .select("id, name")
    .eq("project_id", projectId)
    .eq("is_folder", true)
    .order("name", { ascending: true });

  if (folderErr) throw new Error(`getFolders failed: ${folderErr.message}`);

  if (!folderRows || folderRows.length === 0) return [];

  const ids = folderRows.map((f) => f.id);

  // Pull only parent_folder_id for children — lightweight, all we need to
  // count. For v1 scale this is fine; swap to a Postgres view if it becomes
  // a hot spot.
  const { data: childRows, error: childErr } = await supabase
    .from("files")
    .select("parent_folder_id")
    .eq("project_id", projectId)
    .eq("is_folder", false)
    .in("parent_folder_id", ids);

  if (childErr) throw new Error(`getFolders (counts) failed: ${childErr.message}`);

  const countByFolderId = new Map<string, number>();
  for (const c of childRows ?? []) {
    if (!c.parent_folder_id) continue;
    countByFolderId.set(
      c.parent_folder_id,
      (countByFolderId.get(c.parent_folder_id) ?? 0) + 1,
    );
  }

  return folderRows.map((f) => ({
    name: f.name,
    fileCount: countByFolderId.get(f.id) ?? 0,
  }));
}
