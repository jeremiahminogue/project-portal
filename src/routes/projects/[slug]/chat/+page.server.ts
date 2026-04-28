import { fail } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { isProjectAccessError, requireProjectAccess } from '$lib/server/project-access';
import { getChatSubjects, getProject } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, subjects] = await Promise.all([getProject(event, event.params.slug), getChatSubjects(event, event.params.slug)]);
  return { project, subjects };
};

export const actions: Actions = {
  createSubject: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const title = formString(form, 'title');
    const body = formString(form, 'body');
    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'start conversations for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    if (!title) return fail(400, { error: 'Subject title is required.' });

    const { data, error } = await client
      .from('chat_subjects')
      .insert({ project_id: access.project.id, title, created_by: access.user.id, last_message_at: new Date().toISOString() })
      .select('id')
      .single();
    if (error) return fail(400, { error: error.message });

    if (body) {
      const { error: messageError } = await client.from('chat_messages').insert({ subject_id: data.id, author_id: access.user.id, body });
      if (messageError) return fail(400, { error: messageError.message });
    }
    return { ok: true };
  },

  postMessage: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const subjectId = formString(form, 'subjectId');
    const body = formString(form, 'body');

    if (!subjectId || !body) return fail(400, { error: 'Message is required.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'post messages for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    const { data: subject, error: subjectError } = await client
      .from('chat_subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (subjectError) return fail(400, { error: subjectError.message });
    if (!subject) return fail(404, { error: 'Conversation not found.' });

    const now = new Date().toISOString();
    const { error } = await client.from('chat_messages').insert({ subject_id: subjectId, author_id: access.user.id, body });
    if (error) return fail(400, { error: error.message });
    await client.from('chat_subjects').update({ last_message_at: now }).eq('id', subjectId).eq('project_id', access.project.id);
    return { ok: true };
  }
};
