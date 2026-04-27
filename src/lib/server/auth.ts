import { fail, redirect, type RequestEvent } from '@sveltejs/kit';

export async function requireUser(event: RequestEvent) {
  const me = await event.locals.getCurrentUser();
  if (!me.user) {
    throw redirect(303, `/login?next=${encodeURIComponent(event.url.pathname + event.url.search)}`);
  }
  return me as typeof me & { user: NonNullable<typeof me.user> };
}

export async function requireSuperadmin(event: RequestEvent) {
  const me = await requireUser(event);
  if (!me.isSuperadmin || !me.profile) {
    throw redirect(303, '/');
  }
  return me as typeof me & { profile: NonNullable<typeof me.profile> };
}

export function formString(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function formOptional(form: FormData, name: string) {
  const value = formString(form, name);
  return value === '' ? null : value;
}

export function actionError(message: string, status = 400) {
  return fail(status, { error: message });
}
