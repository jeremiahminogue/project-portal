import "server-only";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Cloudflare R2 client (S3-compatible).
 *
 * R2 presents an S3 API on a per-account endpoint:
 *   https://<accountid>.r2.cloudflarestorage.com
 *
 * Env vars (see .env.local.example):
 *   R2_ENDPOINT            required
 *   R2_ACCESS_KEY_ID       required
 *   R2_SECRET_ACCESS_KEY   required
 *   R2_BUCKET              required (we default to "project-portal-files")
 *   R2_PUBLIC_BASE_URL     optional — for public object URLs if bucket is bound to a custom domain
 */

export interface R2Config {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl?: string;
}

/**
 * Read + validate env. Throws a clear error when anything's missing so the
 * API route returns a 500 with useful text instead of a cryptic AWS error.
 */
export function getR2Config(): R2Config {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET ?? "project-portal-files";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY in .env.local.",
    );
  }

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL,
  };
}

/** Build an S3 client aimed at R2. Region value is ignored by R2 but required by the SDK. */
export function getR2Client(cfg: R2Config = getR2Config()): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    forcePathStyle: true,
  });
}

/** Generate a short-lived presigned PUT URL the browser uploads directly to. */
export async function createPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresInSeconds = 600,
): Promise<{ url: string; key: string; bucket: string }> {
  const cfg = getR2Config();
  const client = getR2Client(cfg);
  const command = new PutObjectCommand({
    Bucket: cfg.bucket,
    Key: key,
    ContentType: contentType,
  });
  const url = await getSignedUrl(client, command, { expiresIn: expiresInSeconds });
  return { url, key, bucket: cfg.bucket };
}

/** Generate a short-lived presigned GET URL for private downloads. */
export async function createPresignedDownloadUrl(
  key: string,
  expiresInSeconds = 600,
): Promise<string> {
  const cfg = getR2Config();
  const client = getR2Client(cfg);
  const command = new GetObjectCommand({ Bucket: cfg.bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Build the storage key for a project file.
 * Pattern: projects/{projectSlug}/{yyyy-mm-dd}/{random}-{safeFilename}
 *
 * - Keys are immutable once written (we never overwrite — new upload = new key).
 * - The date prefix makes `aws s3 ls` output tolerable for humans.
 */
export function buildStorageKey(projectSlug: string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200);
  const today = new Date().toISOString().slice(0, 10);
  const rand = crypto.randomUUID().slice(0, 8);
  return `projects/${projectSlug}/${today}/${rand}-${safe}`;
}
