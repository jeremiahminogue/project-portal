import { env as privateEnv } from '$env/dynamic/private';

type StorageObject = {
  Key?: string;
  Size?: number;
  LastModified?: Date;
};

export type ObjectStorageConfig = {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  forcePathStyle: boolean;
};

function env(...names: string[]) {
  for (const name of names) {
    const value = privateEnv[name] ?? process.env[name];
    if (value) return value;
  }
  return undefined;
}

function boolEnv(name: string, fallback: boolean) {
  const value = privateEnv[name] ?? process.env[name];
  if (!value) return fallback;
  return !['0', 'false', 'no'].includes(value.toLowerCase());
}

export function getObjectStorageConfig(): ObjectStorageConfig {
  const endpoint = env(
    'TIGRIS_ENDPOINT',
    'TIGRIS_ENDPOINT_URL',
    'TIGRIS_STORAGE_ENDPOINT',
    'R2_ENDPOINT',
    'CLOUDFLARE_R2_ENDPOINT',
    'AWS_ENDPOINT_URL_S3',
    'STORAGE_ENDPOINT',
    'S3_ENDPOINT'
  );
  const accessKeyId = env(
    'TIGRIS_ACCESS_KEY_ID',
    'TIGRIS_STORAGE_ACCESS_KEY_ID',
    'R2_ACCESS_KEY_ID',
    'CLOUDFLARE_R2_ACCESS_KEY_ID',
    'AWS_ACCESS_KEY_ID',
    'STORAGE_ACCESS_KEY_ID',
    'S3_ACCESS_KEY_ID'
  );
  const secretAccessKey = env(
    'TIGRIS_SECRET_ACCESS_KEY',
    'TIGRIS_STORAGE_SECRET_ACCESS_KEY',
    'R2_SECRET_ACCESS_KEY',
    'CLOUDFLARE_R2_SECRET_ACCESS_KEY',
    'AWS_SECRET_ACCESS_KEY',
    'STORAGE_SECRET_ACCESS_KEY',
    'S3_SECRET_ACCESS_KEY'
  );
  const bucket =
    env(
      'TIGRIS_BUCKET',
      'TIGRIS_BUCKET_NAME',
      'R2_BUCKET',
      'CLOUDFLARE_R2_BUCKET',
      'BUCKET_NAME',
      'STORAGE_BUCKET',
      'S3_BUCKET'
    ) ??
    'project-portal-files';

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('Object storage is not configured. Set Tigris, R2, STORAGE_*, S3_*, or AWS_* env vars.');
  }

  const directTigris = endpoint.includes('t3.storage.dev') || endpoint.includes('storage.tigris.dev');

  return {
    endpoint,
    accessKeyId,
    secretAccessKey,
    bucket,
    region: env('TIGRIS_REGION', 'R2_REGION', 'CLOUDFLARE_R2_REGION', 'AWS_REGION', 'STORAGE_REGION', 'S3_REGION') ?? 'auto',
    forcePathStyle: boolEnv('STORAGE_FORCE_PATH_STYLE', !directTigris)
  };
}

export function hasObjectStorageConfig() {
  try {
    getObjectStorageConfig();
    return true;
  } catch {
    return false;
  }
}

async function getS3Sdk() {
  return import('@aws-sdk/client-s3');
}

export async function getObjectStorageClient(config = getObjectStorageConfig()) {
  const { S3Client } = await getS3Sdk();
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    },
    forcePathStyle: config.forcePathStyle
  });
}

export async function createPresignedUploadUrl(key: string, contentType: string, expiresInSeconds = 600) {
  const config = getObjectStorageConfig();
  const [{ PutObjectCommand }, { getSignedUrl }, client] = await Promise.all([
    getS3Sdk(),
    import('@aws-sdk/s3-request-presigner'),
    getObjectStorageClient(config)
  ]);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: key,
    ContentType: contentType
  });

  return {
    url: await getSignedUrl(client, command, { expiresIn: expiresInSeconds }),
    key,
    bucket: config.bucket
  };
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  const config = getObjectStorageConfig();
  const [{ PutObjectCommand }, client] = await Promise.all([getS3Sdk(), getObjectStorageClient(config)]);
  return client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength
    })
  );
}

export async function getObject(key: string, range?: string) {
  const config = getObjectStorageConfig();
  const [{ GetObjectCommand }, client] = await Promise.all([getS3Sdk(), getObjectStorageClient(config)]);
  return client.send(
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Range: range
    })
  );
}

export async function deleteObject(key: string) {
  const config = getObjectStorageConfig();
  const [{ DeleteObjectCommand }, client] = await Promise.all([getS3Sdk(), getObjectStorageClient(config)]);
  return client.send(
    new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: key
    })
  );
}

export async function listProjectObjects(projectSlug: string) {
  const config = getObjectStorageConfig();
  const [{ ListObjectsV2Command }, client] = await Promise.all([getS3Sdk(), getObjectStorageClient(config)]);
  const prefix = `projects/${projectSlug}/`;
  const objects: StorageObject[] = [];
  let ContinuationToken: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken
      })
    );
    objects.push(...(page.Contents ?? []).filter((object) => object.Key && object.Size !== 0));
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);

  return objects;
}

export function buildStorageKey(projectSlug: string, filename: string) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  const today = new Date().toISOString().slice(0, 10);
  const rand = crypto.randomUUID().slice(0, 8);
  return `projects/${projectSlug}/${today}/${rand}-${safe}`;
}

export function encodeStorageId(key: string) {
  return `storage:${Buffer.from(key, 'utf8').toString('base64url')}`;
}

export function decodeStorageId(id: string) {
  if (!id.startsWith('storage:')) return null;
  return Buffer.from(id.slice('storage:'.length), 'base64url').toString('utf8');
}

export function responseBody(body: unknown): BodyInit {
  if (!body) return new Blob([]);
  if (body instanceof Blob || body instanceof ReadableStream || body instanceof ArrayBuffer) return body;
  if (body instanceof Uint8Array) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer;
  }
  if (typeof body === 'string') return body;
  const candidate = body as { transformToWebStream?: () => ReadableStream };
  if (typeof candidate.transformToWebStream === 'function') return candidate.transformToWebStream();
  return body as BodyInit;
}

export function contentDisposition(filename: string, disposition: 'inline' | 'attachment') {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
