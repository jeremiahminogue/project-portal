import { env as privateEnv } from '$env/dynamic/private';

export function serverEnv(...names: string[]) {
  for (const name of names) {
    const value = privateEnv[name] ?? process.env[name];
    if (value) return value;
  }

  return undefined;
}

export function serverEnvFlag(name: string, fallback = false) {
  const value = serverEnv(name);
  if (!value) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function isProductionRuntime() {
  if (process.env.VERCEL || process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === 'production';
  }
  return process.env.PORTAL_RUNTIME === 'production';
}

export function isLocalRuntime() {
  return !isProductionRuntime() && !process.env.VERCEL && !process.env.VERCEL_ENV;
}

export function isLocalMockAuthEnabled() {
  return isLocalRuntime() && serverEnvFlag('PORTAL_MOCK_AUTH', true);
}

export function isLocalMockAuthForced() {
  return isLocalRuntime() && serverEnvFlag('PORTAL_FORCE_MOCK_AUTH', false);
}

export function isLocalSuperadminEnabled() {
  return isLocalRuntime() && serverEnvFlag('PORTAL_ENABLE_LOCAL_SUPERADMIN', false);
}
