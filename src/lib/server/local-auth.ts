import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { isLocalMockAuthEnabled, isLocalSuperadminEnabled, serverEnv } from './env';

const LOCAL_SESSION_COOKIE = 'pe_portal_session';
const LOCAL_SESSION_MAX_AGE = 60 * 60 * 12;
export const LOCAL_SUPERADMIN_ID = 'local-superadmin-jeremiah';
export const LOCAL_SUPERADMIN_EMAIL = 'jeremiah@puebloelectrics.com';
const LOCAL_MOCK_USER_ID = '00000000-0000-4000-8000-000000000001';
const LOCAL_MOCK_USER_EMAIL = 'mock.portal.user@puebloelectrics.local';

export function getLocalSuperadminPassword() {
  if (!isLocalSuperadminEnabled()) return null;
  return serverEnv('PORTAL_LOCAL_SUPERADMIN_PASSWORD') ?? null;
}

function secret() {
  const value = serverEnv('PORTAL_LOCAL_AUTH_SECRET', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!value) throw new Error('Set PORTAL_LOCAL_AUTH_SECRET for local fallback admin sessions.');
  return value;
}

function sign(payload: string) {
  return createHmac('sha256', secret()).update(payload).digest('base64url');
}

function sameString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function encodeEmail(email: string) {
  return Buffer.from(email, 'utf8').toString('base64url');
}

function decodeEmail(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function localSuperadmin() {
  return {
    user: { id: LOCAL_SUPERADMIN_ID, email: LOCAL_SUPERADMIN_EMAIL },
    profile: {
      id: LOCAL_SUPERADMIN_ID,
      full_name: 'Jeremiah',
      email: LOCAL_SUPERADMIN_EMAIL,
      role: 'admin' as const,
      company: 'Pueblo Electric',
      title: 'Super Admin',
      avatar_url: null,
      is_superadmin: true
    },
    isSuperadmin: true
  };
}

export function getLocalMockSession() {
  if (!isLocalMockAuthEnabled()) return null;

  return {
    user: { id: LOCAL_MOCK_USER_ID, email: LOCAL_MOCK_USER_EMAIL },
    profile: {
      id: LOCAL_MOCK_USER_ID,
      full_name: 'Local Portal User',
      email: LOCAL_MOCK_USER_EMAIL,
      role: 'admin' as const,
      company: 'Pueblo Electric',
      title: 'Mock Admin',
      avatar_url: null,
      is_superadmin: true
    },
    isSuperadmin: true
  };
}

export function isLocalSuperadminCredentials(email: string, password: string) {
  const configuredPassword = getLocalSuperadminPassword();
  if (!configuredPassword) return false;

  return (
    sameString(email.toLowerCase(), LOCAL_SUPERADMIN_EMAIL) &&
    sameString(password, configuredPassword)
  );
}

export function setSignedAdminSession(event: RequestEvent) {
  const email = LOCAL_SUPERADMIN_EMAIL;
  const expiresAt = Date.now() + LOCAL_SESSION_MAX_AGE * 1000;
  const payload = `${encodeEmail(email)}.${expiresAt}`;
  const token = `${payload}.${sign(payload)}`;

  event.cookies.set(LOCAL_SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: event.url.protocol === 'https:',
    maxAge: LOCAL_SESSION_MAX_AGE
  });
}

export function setLocalAdminSession(event: RequestEvent) {
  if (!isLocalSuperadminEnabled()) {
    throw new Error('Local superadmin sign-in is disabled.');
  }

  setSignedAdminSession(event);
}

export function clearLocalAdminSession(event: RequestEvent) {
  event.cookies.delete(LOCAL_SESSION_COOKIE, { path: '/' });
}

export function getSignedAdminSession(event: RequestEvent) {
  const token = event.cookies.get(LOCAL_SESSION_COOKIE);
  if (!token) return null;

  const [encodedEmail, expiresAtRaw, signature] = token.split('.');
  if (!encodedEmail || !expiresAtRaw || !signature) return null;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    clearLocalAdminSession(event);
    return null;
  }

  const payload = `${encodedEmail}.${expiresAtRaw}`;
  if (!sameString(signature, sign(payload))) return null;

  const email = decodeEmail(encodedEmail).toLowerCase();
  return email === LOCAL_SUPERADMIN_EMAIL ? localSuperadmin() : null;
}

export function getLocalAdminSession(event: RequestEvent) {
  if (!isLocalSuperadminEnabled()) return null;
  return getSignedAdminSession(event);
}
