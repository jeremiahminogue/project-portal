import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/files
 *
 * Records a file row in the `files` table after the browser has successfully
 * uploaded bytes directly to R2 using the presigned URL returned by
 * `/api/files/upload-url`.
 *
 * This is the second half of the direct-to-R2 upload flow:
 *   1. Client calls POST /api/files/upload-url → gets { url, key }
 *   2. Client PUTs bytes to `url` (R2)
 *   3. Client calls POST /api/files (this endpoint) with { projectSlug, key,
 *      name, sizeBytes, mimeType, folderName? } to persist the row.
 *
 * Body:
 *   {
 *     projectSlug: string     // the URL slug, e.g. "1646"
 *     key: string             // R2 storage key returned from upload-url
 *     name: string            // display filename
 *     sizeBytes: number       // actual byte size of the uploaded file
 *     mimeType: string        // e.g. "application/pdf"
 *     folderName?: string     // optional — if set, attach under the matching folder
 *     tags?: string[]         // optional — short labels
 *   }
 *
 * Response (201):
 *   { id: string, name: string, storageKey: string }
 *
 * Auth:
 *   1. Must be a signed-in user (Supabase session cookie).
 *   2. Must be a project_members row for (project_id, user.id) with role
 *      admin|member (guests can view but not insert).
 *   3. DB RLS re-enforces the same rule — this server check is for clean 4xx.
 */

interface FilesRequest {
  projectSlug: string;
  key: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  folderName?: string;
  tags?: string[];
}

// Belt-and-suspenders sanity cap — mirrors the upload-url route.
const MAX_BYTES = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  // Parse + validate body
  let body: FilesRequest;
  try {
    body = (await req.json()) as FilesRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectSlug, key, name, sizeBytes, mimeType, folderName, tags } =
    body;

  if (!projectSlug || typeof projectSlug !== "string") {
    return NextResponse.json({ error: "projectSlug required" }, { status: 400 });
  }
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "key required" }, { status: 400 });
  }
  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (
    typeof sizeBytes !== "number" ||
    !Number.isFinite(sizeBytes) ||
    sizeBytes < 0 ||
    sizeBytes > MAX_BYTES
  ) {
    return NextResponse.json(
      { error: `invalid sizeBytes (0..${MAX_BYTES})` },
      { status: 400 },
    );
  }
  if (!mimeType || typeof mimeType !== "string") {
    return NextResponse.json({ error: "mimeType required" }, { status: 400 });
  }

  // Auth gate — Supabase session
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  // Resolve project
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", projectSlug)
    .maybeSingle();

  if (projectError) {
    return NextResponse.json({ error: projectError.message }, { status: 500 });
  }
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  // Membership gate — admin|member only
  const { data: member, error: memberError } = await supabase
    .from("project_members")
    .select("role")
    .eq("project_id", project.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }
  if (!member || !["admin", "member"].includes(member.role)) {
    return NextResponse.json(
      { error: "Not authorized to add files to this project" },
      { status: 403 },
    );
  }

  // Optional folder resolution — find a parent folder row by name.
  // If the client sent a folderName that doesn't match, we quietly drop it
  // into the root (no parent). This is forgiving by design: a stale UI
  // shouldn't fail the upload.
  let parentFolderId: string | null = null;
  if (folderName && typeof folderName === "string") {
    const { data: folder } = await supabase
      .from("files")
      .select("id")
      .eq("project_id", project.id)
      .eq("is_folder", true)
      .eq("name", folderName)
      .maybeSingle();

    if (folder) {
      parentFolderId = folder.id;
    }
  }

  // Insert the file row
  const { data: row, error: insertError } = await supabase
    .from("files")
    .insert({
      project_id: project.id,
      parent_folder_id: parentFolderId,
      name,
      is_folder: false,
      storage_key: key,
      size_bytes: sizeBytes,
      mime_type: mimeType,
      uploaded_by: user.id,
      tags: Array.isArray(tags) ? tags : [],
    })
    .select("id, name, storage_key")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(
    { id: row.id, name: row.name, storageKey: row.storage_key },
    { status: 201 },
  );
}
