import { env as privateEnv } from '$env/dynamic/private';
import { createHash, createHmac } from 'node:crypto';

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
    const cleaned = value?.replace(/^\uFEFF/, '').replace(/^\u00ef\u00bb\u00bf/, '').trim();
    if (cleaned) return cleaned;
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

function awsEncode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodeKey(key: string) {
  return key
    .split('/')
    .filter(Boolean)
    .map(awsEncode)
    .join('/');
}

function hashHex(value: string | Uint8Array) {
  return createHash('sha256').update(value).digest('hex');
}

function byteBody(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

function hmac(key: string | Uint8Array, value: string) {
  return createHmac('sha256', key).update(value).digest();
}

function hmacHex(key: Uint8Array, value: string) {
  return createHmac('sha256', key).update(value).digest('hex');
}

function signingKey(config: ObjectStorageConfig, date: string) {
  const kDate = hmac(`AWS4${config.secretAccessKey}`, date);
  const kRegion = hmac(kDate, config.region);
  const kService = hmac(kRegion, 's3');
  return hmac(kService, 'aws4_request');
}

function amzNow(date = new Date()) {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return {
    amzDate: iso,
    shortDate: iso.slice(0, 8)
  };
}

function storageTarget(config: ObjectStorageConfig, key = '') {
  const endpoint = new URL(config.endpoint);
  const basePath = endpoint.pathname.replace(/\/+$/, '');
  const encodedKey = encodeKey(key);
  const pathParts = [basePath];

  if (config.forcePathStyle) pathParts.push(awsEncode(config.bucket));
  if (encodedKey) pathParts.push(encodedKey);

  const pathname = `/${pathParts.filter(Boolean).join('/')}`.replace(/\/+/g, '/');
  const host = config.forcePathStyle ? endpoint.host : `${config.bucket}.${endpoint.host}`;
  return {
    protocol: endpoint.protocol,
    host,
    pathname: pathname || '/'
  };
}

function canonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join('&');
}

function canonicalHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function signedHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers)
    .map(([key, value]) => [key.toLowerCase(), canonicalHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    canonicalHeaders: entries.map(([key, value]) => `${key}:${value}\n`).join(''),
    signedHeaders: entries.map(([key]) => key).join(';')
  };
}

function signature({
  config,
  method,
  pathname,
  query,
  headers,
  payloadHash,
  amzDate,
  shortDate
}: {
  config: ObjectStorageConfig;
  method: string;
  pathname: string;
  query: string;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
  shortDate: string;
}) {
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const headerParts = signedHeaders(headers);
  const canonicalRequest = [
    method,
    pathname,
    query,
    headerParts.canonicalHeaders,
    headerParts.signedHeaders,
    payloadHash
  ].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, hashHex(canonicalRequest)].join('\n');
  return {
    signature: hmacHex(signingKey(config, shortDate), stringToSign),
    scope,
    signedHeaders: headerParts.signedHeaders
  };
}

export async function createPresignedUploadUrl(key: string, contentType: string, expiresInSeconds = 600) {
  const config = getObjectStorageConfig();
  const target = storageTarget(config, key);
  const { amzDate, shortDate } = amzNow();
  const headers = { host: target.host };
  const scope = `${shortDate}/${config.region}/s3/aws4_request`;
  const queryParams = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host'
  };
  const query = canonicalQuery(queryParams);
  const signed = signature({
    config,
    method: 'PUT',
    pathname: target.pathname,
    query,
    headers,
    payloadHash: 'UNSIGNED-PAYLOAD',
    amzDate,
    shortDate
  });
  return {
    url: `${target.protocol}//${target.host}${target.pathname}?${query}&X-Amz-Signature=${signed.signature}`,
    key,
    contentType,
    bucket: config.bucket
  };
}

export async function putObject(key: string, body: Uint8Array, contentType: string) {
  const config = getObjectStorageConfig();
  return storageFetch(config, 'PUT', key, {}, body, {
    'content-type': contentType,
    'content-length': String(body.byteLength)
  });
}

export async function getObject(key: string, range?: string) {
  const config = getObjectStorageConfig();
  const response = await storageFetch(config, 'GET', key, {}, undefined, range ? { range } : {});
  const contentLength = response.headers.get('content-length');
  return {
    Body: response.body,
    ContentType: response.headers.get('content-type') ?? undefined,
    ContentLength: contentLength ? Number(contentLength) : undefined,
    ContentRange: response.headers.get('content-range') ?? undefined
  };
}

export async function deleteObject(key: string) {
  const config = getObjectStorageConfig();
  return storageFetch(config, 'DELETE', key);
}

async function storageFetch(
  config: ObjectStorageConfig,
  method: string,
  key = '',
  queryParams: Record<string, string> = {},
  body?: Uint8Array,
  extraHeaders: Record<string, string> = {}
) {
  const target = storageTarget(config, key);
  const { amzDate, shortDate } = amzNow();
  const payloadHash = body ? hashHex(body) : 'UNSIGNED-PAYLOAD';
  const headers: Record<string, string> = {
    host: target.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
    ...extraHeaders
  };
  const query = canonicalQuery(queryParams);
  const signed = signature({
    config,
    method,
    pathname: target.pathname,
    query,
    headers,
    payloadHash,
    amzDate,
    shortDate
  });
  const requestHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (key !== 'host') requestHeaders.set(key, value);
  }
  requestHeaders.set(
    'authorization',
    `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${signed.scope}, SignedHeaders=${signed.signedHeaders}, Signature=${signed.signature}`
  );

  const url = `${target.protocol}//${target.host}${target.pathname}${query ? `?${query}` : ''}`;
  const response = await fetch(url, { method, headers: requestHeaders, body: body ? byteBody(body) : undefined });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw storageHttpError(response.status, text || response.statusText);
  }
  return response;
}

function errorStatus(error: unknown) {
  const metadata = (error as { $metadata?: { httpStatusCode?: number } } | null)?.$metadata;
  return metadata?.httpStatusCode;
}

function storageHttpError(status: number, message: string) {
  const error = new Error(message) as Error & { $metadata: { httpStatusCode: number }; Code?: string; code?: string };
  error.name = status === 404 ? 'NoSuchKey' : 'ObjectStorageHttpError';
  error.Code = error.name;
  error.code = error.name;
  error.$metadata = { httpStatusCode: status };
  return error;
}

export function isObjectNotFoundError(error: unknown) {
  const status = errorStatus(error);
  const name = (error as { name?: string; Code?: string; code?: string } | null)?.name;
  const code =
    (error as { Code?: string; code?: string } | null)?.Code ??
    (error as { Code?: string; code?: string } | null)?.code ??
    name;
  return status === 404 || code === 'NoSuchKey' || code === 'NotFound' || code === 'NotFoundException';
}

export function storageErrorStatus(error: unknown) {
  if (isObjectNotFoundError(error)) return 404;
  const status = errorStatus(error);
  if (status === 401 || status === 403) return 502;
  if (status && status >= 400 && status < 500) return 400;
  return 502;
}

export function storageErrorMessage(error: unknown, action: string) {
  if (isObjectNotFoundError(error)) return `Storage object was not found while trying to ${action}.`;
  const raw = error instanceof Error ? error.message : '';
  if (raw) return `Object storage could not ${action}: ${raw}`;
  return `Object storage could not ${action}.`;
}

export async function listProjectObjects(projectSlug: string) {
  const config = getObjectStorageConfig();
  const prefix = `projects/${projectSlug}/`;
  const objects: StorageObject[] = [];
  let ContinuationToken: string | undefined;
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({ ignoreAttributes: false });

  do {
    const query: Record<string, string> = {
      'list-type': '2',
      prefix
    };
    if (ContinuationToken) query['continuation-token'] = ContinuationToken;
    const response = await storageFetch(config, 'GET', '', query);
    const parsed = parser.parse(await response.text());
    const result = parsed?.ListBucketResult ?? {};
    const contents = Array.isArray(result.Contents) ? result.Contents : result.Contents ? [result.Contents] : [];
    objects.push(
      ...contents
        .filter((object: StorageObject) => object.Key && Number(object.Size ?? 0) !== 0)
        .map((object: any) => ({
          Key: object.Key,
          Size: Number(object.Size ?? 0),
          LastModified: object.LastModified ? new Date(object.LastModified) : undefined
        }))
    );
    ContinuationToken = result.NextContinuationToken;
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
