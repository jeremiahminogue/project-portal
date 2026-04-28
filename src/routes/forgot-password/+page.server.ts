import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({});

function value(form: FormData, name: string) {
  const field = form.get(name);
  return typeof field === 'string' ? field.trim() : '';
}

export const actions: Actions = {
  requestReset: async ({ request, locals, url }) => {
    const supabase = locals.supabase;
    const form = await request.formData();
    const email = value(form, 'email').toLowerCase();

    if (!email) return fail(400, { error: 'Email is required.' });
    if (!supabase) return fail(400, { error: 'Supabase is not configured yet.', email });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${url.origin}/auth/callback?next=/reset-password`
    });

    if (error) return fail(400, { error: friendlyError(error.message), email });
    return { sent: true, email };
  }
};

function friendlyError(raw: string) {
  const lower = raw.toLowerCase();
  if (lower.includes('rate limit') || lower.includes('too many')) return 'Too many attempts. Wait a minute and try again.';
  return raw;
}
