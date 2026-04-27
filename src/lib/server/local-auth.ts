import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';
import { serverEnv } from './env';

const LOCAL_SESSION_COOKIE = 'pe_portal_session';
const LOCAL_SESSION_MAX_AGE = 60 * 60 * 12;
export const LOCAL_SUPERADMIN_ID = 'local-superadmin-jeremiah';
export const LOCAL_SUPERADMIN_EMAIL = 'jeremiah@puebloelectrics.com';
export const LOCAL_SUPERADMIN_PASSWORD = '<redacted-local-password>';

function secret() {
  return serverEnv('PORTAL_LOCAL_AUTH_SECRET', 'SUPABASE_SERVICE_ROLE_KEY') ?? LOCAL_SUPERADMIN_PASSWORD;
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

export function isLocalSuperadminCredentials(email: string, password: string) {
  return (
    sameString(email.toLowerCase(), LOCAL_SUPERADMIN_EMAIL) &&
    sameString(password, LOCAL_SUPERADMIN_PASSWORD)
  );
}

export function setLocalAdminSession(event: RequestEvent) {
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

export function clearLocalAdminSession(event: RequestEvent) {
  event.cookies.delete(LOCAL_SESSION_COOKIE, { path: '/' });
}

export function getLocalAdminSession(event: RequestEvent) {
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
