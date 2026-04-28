import { json } from '@sveltejs/kit';
import { createPresignedUploadUrl, getObjectStorageConfig } from '$lib/server/object-storage';
import type { RequestHandler } from './$types';

// Diagnostic-only: signs a presigned PUT URL the same way the upload flow does,
// then immediately PUTs a tiny payload to it from the server. Returns the raw
// status + body so we can see exactly what Tigris is rejecting.
//
// Hit this once at /api/health/storage-put?token=<DIAG_TOKEN_env_value>.
// Remove the route once the upload bug is identified.

export const GET: RequestHandler = async ({ url }) => {
  const expected = process.env.DIAG_TOKEN ?? '';
  const provided = url.searchParams.get('token') ?? '';
  if (!expected || provided !== expected) {
    return json({ error: 'Set DIAG_TOKEN env var and pass ?token= to use this route.' }, { status: 401 });
  }

  let config;
  try {
    config = getObjectStorageConfig();
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }

  const key = `_diag/storage-put-${Date.now()}.bin`;
  const contentType = 'application/octet-stream';
  const presigned = await createPresignedUploadUrl(key, contentType, 120);

  const body = new Uint8Array([1, 2, 3, 4]);
  let putStatus = 0;
  let putBody = '';
  let putHeaders: Record<string, string> = {};
  try {
    const response = await fetch(presigned.url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body
    });
    putStatus = response.status;
    putBody = await response.text();
    putHeaders = Object.fromEntries(response.headers.entries());
  } catch (error) {
    return json({
      stage: 'fetch-threw',
      error: error instanceof Error ? error.message : String(error),
      url: presigned.url
    }, { status: 500 });
  }

  return json({
    config: {
      endpoint: config.endpoint,
      bucket: config.bucket,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      accessKeyIdPrefix: config.accessKeyId.slice(0, 12) + '...'
    },
    presignedKey: presigned.key,
    presignedUrl: presigned.url,
    put: {
      status: putStatus,
      headers: putHeaders,
      body: putBody
    }
  });
};
