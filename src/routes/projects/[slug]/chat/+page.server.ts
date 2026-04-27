import { fail } from '@sveltejs/kit';
import { formString, requireUser } from '$lib/server/auth';
import { getChatSubjects, getProject, getProjectId } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, subjects] = await Promise.all([getProject(event, event.params.slug), getChatSubjects(event, event.params.slug)]);
  return { project, subjects };
};

export const actions: Actions = {
  createSubject: async (event) => {
    const me = await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const title = formString(form, 'title');
    const body = formString(form, 'body');
    const projectId = await getProjectId(event, event.params.slug);

    if (!projectId || !title) return fail(400, { error: 'Subject title is required.' });

    const { data, error } = await client
      .from('chat_subjects')
      .insert({ project_id: projectId, title, created_by: me.user.id, last_message_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) return fail(400, { error: error.message });

    if (body) {
      await client.from('chat_messages').insert({ subject_id: data.id, author_id: me.user.id, body });
    }
    return { ok: true };
  },

  postMessage: async (event) => {
    const me = await requireUser(event);
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const subjectId = formString(form, 'subjectId');
    const body = formString(form, 'body');

    if (!subjectId || !body) return fail(400, { error: 'Message is required.' });

    const now = new Date().toISOString();
    const { error } = await client.from('chat_messages').insert({ subject_id: subjectId, author_id: me.user.id, body });
    if (error) return fail(400, { error: error.message });
    await client.from('chat_subjects').update({ last_message_at: now }).eq('id', subjectId);
    return { ok: true };
  }
};
