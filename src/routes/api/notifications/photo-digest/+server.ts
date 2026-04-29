import { json } from '@sveltejs/kit';
import { canRunNotificationCron, flushPhotoDigestNotifications } from '$lib/server/notifications';
import type { RequestHandler } from './$types';

async function run(request: Request, locals: App.Locals) {
  if (!canRunNotificationCron(request)) {
    return json({ error: 'Notification digest is not authorized.' }, { status: 401 });
  }

  const result = await flushPhotoDigestNotifications({ locals });
  return json(result);
}

export const GET: RequestHandler = ({ request, locals }) => run(request, locals);

export const POST: RequestHandler = ({ request, locals }) => run(request, locals);
