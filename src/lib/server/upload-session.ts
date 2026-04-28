import { createHmac, timingSafeEqual } from 'node:crypto';
import type { DocumentKind } from './drawing-ocr';
import { isProductionRuntime, serverEnv } from './env';

const UPLOAD_SESSION_TTL_MS = 15 * 60 * 1000;

export type UploadSession = {
  version: 1;
  projectSlug: string;
  key: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  documentKind: DocumentKind;
  userId: string;
  expiresAt: number;
};

function uploadSecret() {
  const secret = serverEnv('PORTAL_UPLOAD_TOKEN_SECRET', 'PORTAL_LOCAL_AUTH_SECRET', 'SUPABASE_SERVICE_ROLE_KEY');
  if (secret) return secret;
  if (isProductionRuntime()) throw new Error('Upload token signing secret is not configured.');
  return 'dev-upload-token-secret';
}

function sign(value: string) {
  return createHmac('sha256', uploadSecret()).update(value).digest('base64url');
}

function safeEqual(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  if (leftBytes.byteLength !== rightBytes.byteLength) return false;
  return timingSafeEqual(leftBytes, rightBytes);
}

function isUploadSession(value: unknown): value is UploadSession {
  const candidate = value as Partial<UploadSession> | null;
  return (
    candidate?.version === 1 &&
    typeof candidate.projectSlug === 'string' &&
    typeof candidate.key === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.sizeBytes === 'number' &&
    typeof candidate.mimeType === 'string' &&
    (candidate.documentKind === 'drawing' || candidate.documentKind === 'specification' || candidate.documentKind === 'file') &&
    typeof candidate.userId === 'string' &&
    typeof candidate.expiresAt === 'number'
  );
}

export function projectStoragePrefix(projectSlug: string) {
  return `projects/${projectSlug}/`;
}

export function isProjectStorageKey(projectSlug: string, key: string) {
  return key.startsWith(projectStoragePrefix(projectSlug)) && !key.includes('..') && !key.includes('\\');
}

export function issueUploadSession(input: Omit<UploadSession, 'version' | 'expiresAt'>) {
  const session: UploadSession = {
    version: 1,
    ...input,
    expiresAt: Date.now() + UPLOAD_SESSION_TTL_MS
  };
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export function verifyUploadSession(token: string) {
  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(sign(payload), signature)) {
    throw new Error('Upload authorization is invalid. Please try uploading again.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Upload authorization is invalid. Please try uploading again.');
  }

  if (!isUploadSession(parsed)) throw new Error('Upload authorization is invalid. Please try uploading again.');
  if (parsed.expiresAt < Date.now()) throw new Error('Upload authorization expired. Please upload the file again.');
  if (!isProjectStorageKey(parsed.projectSlug, parsed.key)) throw new Error('Upload authorization points to an invalid storage key.');
  return parsed;
}
