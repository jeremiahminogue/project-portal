import { createClient } from '@supabase/supabase-js';
import { serverEnv } from './env';

function supabaseUrl() {
  return serverEnv('PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
}

export function createAdminClient() {
  const url = supabaseUrl();
  const key = serverEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!url || !key) {
    throw new Error('Supabase admin is not configured. Set SUPABASE_SERVICE_ROLE_KEY and the Supabase URL env var.');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
