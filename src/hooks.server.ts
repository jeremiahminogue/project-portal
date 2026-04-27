import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { getLocalAdminSession } from '$lib/server/local-auth';
import { serverEnv } from '$lib/server/env';
import { ensureConfiguredSuperadmin } from '$lib/server/superadmin';

function env(name: string) {
  return serverEnv(name);
}

export function supabaseUrl() {
  return env('PUBLIC_SUPABASE_URL') ?? env('NEXT_PUBLIC_SUPABASE_URL');
}

export function supabaseAnonKey() {
  return env('PUBLIC_SUPABASE_ANON_KEY') ?? env('NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

let configuredSuperadminId: string | null = null;

function isProtectedPath(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/projects') ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/directory')
  );
}

export const handle: Handle = async ({ event, resolve }) => {
  const url = supabaseUrl();
  const anonKey = supabaseAnonKey();
  event.locals.isLocalSuperadmin = false;

  if (url && anonKey) {
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
    const localAdmin = getLocalAdminSession(event);
    if (localAdmin) {
      event.locals.isLocalSuperadmin = true;
      if (event.locals.supabase) {
        try {
          if (!configuredSuperadminId) {
            const configuredUser = await ensureConfiguredSuperadmin();
            configuredSuperadminId = configuredUser.id;
          }
          return {
            ...localAdmin,
            user: { ...localAdmin.user, id: configuredSuperadminId },
            profile: { ...localAdmin.profile, id: configuredSuperadminId }
          };
        } catch {
          configuredSuperadminId = null;
        }
      }
      return localAdmin;
    }

    const supabase = event.locals.supabase;
    if (!supabase) {
      event.locals.isLocalSuperadmin = false;
      return { user: null, profile: null, isSuperadmin: false };
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
  const pathname = event.url.pathname;

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
