import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next') ?? '/');

  if (code && locals.supabase) {
    const { error } = await locals.supabase.auth.exchangeCodeForSession(code);
    if (error) {
      if (next === '/reset-password') {
        throw redirect(303, `/reset-password?error=${encodeURIComponent(error.message)}`);
      }
      throw redirect(303, `/login?error=${encodeURIComponent(error.message)}`);
    }
  }

  throw redirect(303, next);
};

function safeNext(next: string) {
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  return next;
}
