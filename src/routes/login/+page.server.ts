import { fail, redirect } from '@sveltejs/kit';
import { clearLocalAdminSession } from '$lib/server/local-auth';
import { isConfiguredSuperadmin, setConfiguredSuperadminSession } from '$lib/server/superadmin';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
  return {
    next: url.searchParams.get('next') ?? '/'
  };
};

function value(form: FormData, name: string) {
  const field = form.get(name);
  return typeof field === 'string' ? field.trim() : '';
}

export const actions: Actions = {
  signin: async (event) => {
    const { request, locals, url } = event;
    const form = await request.formData();
    const email = value(form, 'email').toLowerCase();
    const password = value(form, 'password');
    const next = value(form, 'next') || url.searchParams.get('next') || '/';

    if (!email || !password) return fail(400, { error: 'Email and password are required.', email });

    if (isConfiguredSuperadmin(email, password)) {
      setConfiguredSuperadminSession(event);
      throw redirect(303, safeNext(next));
    }

    const supabase = locals.supabase;
    if (!supabase) {
      return fail(400, {
        error: 'Supabase is not configured for regular users yet. Use the Pueblo Electric admin account or add Supabase settings.',
        email
      });
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return fail(400, { error: friendlyError(error.message), email });

    clearLocalAdminSession(event);
    throw redirect(303, safeNext(next));
  },

  signup: async ({ request, locals, url }) => {
    const supabase = locals.supabase;
    const form = await request.formData();
    const email = value(form, 'email').toLowerCase();
    const password = value(form, 'password');
    const next = value(form, 'next') || url.searchParams.get('next') || '/';

    if (!email || !password) return fail(400, { error: 'Email and password are required.', email });
    if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.', email });
    if (!supabase) return fail(400, { error: 'Account creation is handled from the admin console until Supabase sign-ups are enabled.', email });

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`
      }
    });

    if (error) return fail(400, { error: friendlyError(error.message), email });
    if (data.session) throw redirect(303, safeNext(next));

    return { sent: true, email };
  }
};

function safeNext(next: string) {
  if (!next.startsWith('/')) return '/';
  if (next.startsWith('//')) return '/';
  return next;
}

function friendlyError(raw: string) {
  const lower = raw.toLowerCase();
  if (lower.includes('invalid login credentials')) return "Email or password doesn't match.";
  if (lower.includes('email not confirmed')) return 'Confirm your email before signing in.';
  if (lower.includes('user already registered')) return 'That email already has an account.';
  if (lower.includes('signup') && lower.includes('disabled')) return 'Sign-ups are disabled. Ask Pueblo Electric for an invite.';
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  return raw;
}
