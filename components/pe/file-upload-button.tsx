"use client";

/**
 * FileUploadButton — pairs with:
 *   POST /api/files/upload-url  (returns presigned PUT URL for R2)
 *   POST /api/files             (records the DB row after upload completes)
 *
 * Flow:
 *   1. User picks a file via the hidden <input type="file">
 *   2. We request a presigned URL from /api/files/upload-url
 *   3. Browser PUTs the file bytes directly to R2 (server never proxies bytes)
 *   4. We POST /api/files to persist a row in Supabase
 *   5. `router.refresh()` re-renders the server component, new file appears
 *
 * Intentional design choices:
 *   - No drag-drop for v1 — picker is simpler and touch-friendly
 *   - Single-file at a time — keeps the status banner readable
 *   - All error messages are human-readable; we don't surface raw fetch errors
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploadButtonProps {
  projectSlug: string;
  folderName?: string;
  /** Optional cap on bytes — defaults to 100 MB (matches server cap). */
  maxBytes?: number;
}

type Status =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; percent: number }
  | { kind: "success"; filename: string }
  | { kind: "error"; message: string };

const DEFAULT_MAX = 100 * 1024 * 1024;

export function FileUploadButton({
  projectSlug,
  folderName,
  maxBytes = DEFAULT_MAX,
}: FileUploadButtonProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  function openPicker() {
    if (status.kind === "uploading") return;
    inputRef.current?.click();
  }

  async function handleFile(file: File) {
    if (file.size > maxBytes) {
      setStatus({
        kind: "error",
        message: `File too large (max ${Math.round(maxBytes / (1024 * 1024))} MB)`,
      });
      return;
    }

    setStatus({ kind: "uploading", filename: file.name, percent: 0 });

    // Step 1 — presigned URL
    let url: string;
    let key: string;
    try {
      const res = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error ?? `Upload URL failed (${res.status})`);
      }
      const body = (await res.json()) as { url: string; key: string };
      url = body.url;
      key = body.key;
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Could not prepare upload",
      });
      return;
    }

    // Step 2 — PUT to R2 (with progress via XHR, since fetch can't stream progress cross-browser)
    try {
      await putToR2(url, file, (percent) => {
        setStatus({ kind: "uploading", filename: file.name, percent });
      });
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Upload failed",
      });
      return;
    }

    // Step 3 — record the DB row
    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectSlug,
          key,
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || "application/octet-stream",
          folderName,
        }),
      });
      if (!res.ok) {
        const body = await safeJson(res);
        throw new Error(body?.error ?? `Could not save file (${res.status})`);
      }
    } catch (e) {
      // The bytes are in R2 but the DB row failed — surface that clearly.
      // Future polish: a janitor task to GC orphaned R2 objects.
      setStatus({
        kind: "error",
        message:
          e instanceof Error
            ? `Uploaded to R2 but could not record: ${e.message}`
            : "Uploaded to R2 but could not record the file",
      });
      return;
    }

    setStatus({ kind: "success", filename: file.name });
    router.refresh();

    // Auto-clear success state after a beat so the button looks clean again.
    window.setTimeout(() => {
      setStatus((s) => (s.kind === "success" ? { kind: "idle" } : s));
    }, 4000);
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset the input so re-selecting the same file still fires the event.
    e.target.value = "";
    if (file) handleFile(file);
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={onChange}
      />
      <Button
        variant="default"
        size="sm"
        onClick={openPicker}
        disabled={status.kind === "uploading"}
        className="gap-2"
      >
        {status.kind === "uploading" ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {status.percent > 0
              ? `Uploading ${status.percent}%`
              : "Preparing…"}
          </>
        ) : (
          <>
            <Upload className="h-4 w-4" />
            Upload
          </>
        )}
      </Button>

      {status.kind === "success" && (
        <span className="flex items-center gap-1.5 text-xs text-pe-green-dark">
          <CheckCircle2 className="h-3.5 w-3.5" />
          {status.filename}
        </span>
      )}

      {status.kind === "error" && (
        <span className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {status.message}
        </span>
      )}
    </div>
  );
}

async function safeJson(res: Response): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

/**
 * XMLHttpRequest wrapper for the R2 PUT, because `fetch` does not expose
 * upload progress on any major browser in 2026. If progress isn't needed
 * later we can simplify to `fetch(url, { method: "PUT", body: file })`.
 */
function putToR2(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url, true);
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress(Math.round((ev.loaded / ev.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`R2 upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(file);
  });
}
