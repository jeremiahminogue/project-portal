import { redirect } from '@sveltejs/kit';
import { clearLocalAdminSession } from '$lib/server/local-auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async (event) => {
  const { locals } = event;
  clearLocalAdminSession(event);
  await locals.supabase?.auth.signOut();
  throw redirect(303, '/login');
};
