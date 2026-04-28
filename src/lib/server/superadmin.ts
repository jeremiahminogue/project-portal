import { scryptSync, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { isLocalSuperadminCredentials, setSignedAdminSession } from './local-auth';
import { serverEnv } from './env';

const HARDCODED_SUPERADMIN_EMAILS = new Set(['jeremiah@puebloelectrics.com']);

export function isHardcodedSuperadminEmail(email: string | null | undefined) {
  return Boolean(email && HARDCODED_SUPERADMIN_EMAILS.has(email.toLowerCase()));
}

export function hardcodedSuperadminProfile(user: { id: string; email: string | null }) {
  return {
    id: user.id,
    full_name: 'Jeremiah',
    email: user.email ?? 'jeremiah@puebloelectrics.com',
    role: 'admin' as const,
    company: 'Pueblo Electric',
    title: 'Super Admin',
    avatar_url: null,
    is_superadmin: true
  };
}

export function setConfiguredSuperadminSession(event: RequestEvent) {
  setSignedAdminSession(event);
}

export function isConfiguredSuperadmin(email: string, password: string) {
  return isLocalSuperadminCredentials(email, password) || isHardcodedSuperadminPassword(email, password);
}

function isHardcodedSuperadminPassword(email: string, password: string) {
  if (!isHardcodedSuperadminEmail(email)) return false;
  const hash = serverEnv('PORTAL_SUPERADMIN_PASSWORD_HASH');
  if (!hash) return false;
  return verifyPasswordHash(password, hash);
}

function verifyPasswordHash(password: string, encoded: string) {
  const [scheme, salt, key] = encoded.split(':');
  if (scheme !== 'scrypt' || !salt || !key) return false;

  const expected = Buffer.from(key, 'base64url');
  const actual = scryptSync(password, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
