import { env as privateEnv } from '$env/dynamic/private';

export function serverEnv(...names: string[]) {
  for (const name of names) {
    const value = privateEnv[name] ?? process.env[name];
    if (value) return value;
  }

  return undefined;
}
