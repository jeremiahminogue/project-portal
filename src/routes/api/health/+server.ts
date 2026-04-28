import { json } from '@sveltejs/kit';
import { serverEnv } from '$lib/server/env';
import { hasObjectStorageConfig } from '$lib/server/object-storage';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
  return json({
    ok: true,
    stack: 'sveltekit',
    svelte: '5',
    siteUrl: serverEnv('PUBLIC_SITE_URL', 'NEXT_PUBLIC_SITE_URL', 'SITE_URL') ?? null,
    supabase: Boolean(serverEnv('PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL')),
    supabaseAnonKey: Boolean(serverEnv('PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY')),
    objectStorage: hasObjectStorageConfig(),
    email: Boolean(serverEnv('RESEND_API_KEY'))
  });
};
