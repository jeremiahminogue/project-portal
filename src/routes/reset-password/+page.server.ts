import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const code = event.url.searchParams.get('code');
  const resetError = event.url.searchParams.get('error');

  if (resetError) {
    return { ready: false, error: friendlyError(resetError) };
  }

  if (code && event.locals.supabase) {
    const { error } = await event.locals.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return { ready: false, error: friendlyError(error.message) };
    }
    throw redirect(303, '/reset-password');
  }

  const me = await event.locals.getCurrentUser();
  return {
    ready: Boolean(me.user),
    email: me.user?.email ?? null
  };
};

function value(form: FormData, name: string) {
  const field = form.get(name);
  return typeof field === 'string' ? field.trim() : '';
}

export const actions: Actions = {
  updatePassword: async (event) => {
    const supabase = event.locals.supabase;
    if (!supabase) return fail(400, { error: 'Supabase is not configured yet.' });

    const me = await event.locals.getCurrentUser();
    if (!me.user) return fail(401, { error: 'Open the reset link from your email before setting a new password.' });

    const form = await event.request.formData();
    const password = value(form, 'password');
    const confirmPassword = value(form, 'confirmPassword');

    if (password.length < 8) return fail(400, { error: 'Password must be at least 8 characters.' });
    if (password !== confirmPassword) return fail(400, { error: 'Passwords do not match.' });

    const { error } = await supabase.auth.updateUser({ password });
    if (error) return fail(400, { error: friendlyError(error.message) });

    return { updated: true };
  }
};

function friendlyError(raw: string) {
  const lower = raw.toLowerCase();
  if (lower.includes('session') || lower.includes('jwt')) return 'Your reset link expired. Request a new password reset email.';
  if (lower.includes('weak') || lower.includes('password')) return 'Choose a stronger password.';
  return raw;
}
