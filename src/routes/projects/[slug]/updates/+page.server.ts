import { fail } from '@sveltejs/kit';
import { formString, requireUser } from '$lib/server/auth';
import { sendPortalEmail } from '$lib/server/email';
import { getDirectory, getProject, getProjectId, getUpdates } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, updates, directory] = await Promise.all([
    getProject(event, event.params.slug),
    getUpdates(event, event.params.slug),
    getDirectory(event, event.params.slug)
  ]);
  return { project, updates, directory };
};

export const actions: Actions = {
  postUpdate: async (event) => {
    const me = await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const projectId = await getProjectId(event, event.params.slug);
    const title = formString(form, 'title');
    const body = formString(form, 'body');
    const kind = formString(form, 'kind') || 'general';
    const notify = form.get('notify') === 'on';

    if (!projectId) return fail(404, { error: 'Project not found.' });
    if (!title || !body) return fail(400, { error: 'Title and body are required.' });

    const { error } = await client.from('updates').insert({
      project_id: projectId,
      title,
      body,
      kind,
      author_id: me.user.id
    });
    if (error) return fail(400, { error: error.message });

    if (notify) {
      const directory = await getDirectory(event, event.params.slug);
      await sendPortalEmail({
        to: directory.map((person) => person.email).filter(Boolean) as string[],
        subject: `Project update: ${title}`,
        html: `<p>${body.replace(/\n/g, '<br>')}</p>`
      });
    }

    return { ok: true };
  }
};
