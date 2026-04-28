import { createServerClient } from '@supabase/ssr';
import { error, redirect, type Handle } from '@sveltejs/kit';
import { getLocalAdminSession, getLocalMockSession } from '$lib/server/local-auth';
import { isLocalMockAuthForced, isProductionRuntime, serverEnv } from '$lib/server/env';

function env(name: string) {
  return serverEnv(name);
}

export function supabaseUrl() {
  return env('PUBLIC_SUPABASE_URL') ?? env('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey() {
  return env('PUBLIC_SUPABASE_ANON_KEY') ?? env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

function isProtectedPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname === '/login' ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/directory') ||
    pathname.startsWith('/api/files')
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  const pathname = event.url.pathname;
  const forceLocalMockAuth = isLocalMockAuthForced();
  event.locals.isLocalSuperadmin = false;

  if ((!url || !anonKey) && isProductionRuntime() && isProtectedPath(pathname)) {
    throw error(503, 'Portal authentication is not configured.');
  }

  if (url && anonKey && !forceLocalMockAuth) {
    event.locals.supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll: () => event.cookies.getAll(),
        setAll: (cookiesToSet) => {
          for (const { name, value, options } of cookiesToSet) {
            event.cookies.set(name, value, {
              ...options,
              path: options.path ?? '/',
              secure: event.url.protocol === 'https:' ? options.secure : false
            });
          }
        }
      }
    });
  } else {
    event.locals.supabase = null;
  }

  event.locals.getCurrentUser = async () => {
    if (forceLocalMockAuth) {
      event.locals.isLocalSuperadmin = false;
      return getLocalMockSession() ?? { user: null, profile: null, isSuperadmin: false };
    }

    const localAdmin = getLocalAdminSession(event);
    if (localAdmin) {
      event.locals.isLocalSuperadmin = true;
      return localAdmin;
    }

    const supabase = event.locals.supabase;
    if (!supabase) {
      event.locals.isLocalSuperadmin = false;
      return getLocalMockSession() ?? { user: null, profile: null, isSuperadmin: false };
    }

    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error || !user) {
      event.locals.isLocalSuperadmin = false;
      return { user: null, profile: null, isSuperadmin: false };
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, company, title, avatar_url, is_superadmin')
      .eq('id', user.id)
      .maybeSingle();

    event.locals.isLocalSuperadmin = false;
    return {
      user: { id: user.id, email: user.email ?? null },
      profile: profile ?? null,
      isSuperadmin: Boolean(profile?.is_superadmin)
    };
  };

  const me = await event.locals.getCurrentUser();

  if (me.user && pathname === '/login') {
    throw redirect(303, '/');
  }

  if (!me.user && isProtectedPath(pathname)) {
    const next = pathname + event.url.search;
    throw redirect(303, `/login?next=${encodeURIComponent(next)}`);
  }

  return resolve(event, {
    filterSerializedResponseHeaders: (name) =>
      name === 'content-range' || name === 'x-supabase-api-version'
  });
};
