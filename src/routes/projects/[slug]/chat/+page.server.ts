import { error, fail, type RequestEvent } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import { getChatSubjects, getProject } from '$lib/server/queries';
import { createAdminClient, hasSupabaseAdminConfig } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

function privilegedClient(event: RequestEvent) {
  return hasSupabaseAdminConfig() ? createAdminClient() : event.locals.supabase;
}

export const load: PageServerLoad = async (event) => {
  const access = await requireProjectAccess(event, event.params.slug);
  if (isProjectAccessError(access)) throw error(access.status, access.message);
  const [project, subjects] = await Promise.all([getProject(event, event.params.slug), getChatSubjects(event, event.params.slug)]);
  return {
    project,
    subjects,
    chatAccess: {
      role: access.role,
      canCreate: projectRoleCapabilities[access.role].canCreateCommunication,
      canDelete: projectRoleCapabilities[access.role].canDeleteChat
    }
  };
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
    const activityClient = privilegedClient(event);
    if (!activityClient) return fail(400, { error: 'Supabase is not configured yet.' });
    const { error: touchError } = await activityClient
      .from('chat_subjects')
      .update({ last_message_at: now })
      .eq('id', subjectId)
      .eq('project_id', access.project.id);
    if (touchError) return fail(400, { error: touchError.message });
    return { ok: true };
  },

  deleteSubject: async (event) => {
    const form = await event.request.formData();
    const subjectId = formString(form, 'subjectId');
    if (!subjectId) return fail(400, { error: 'Choose a conversation to delete.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete project chat'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    const client = privilegedClient(event);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const { data: subject, error: subjectError } = await client
      .from('chat_subjects')
      .select('id')
      .eq('id', subjectId)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (subjectError) return fail(400, { error: subjectError.message });
    if (!subject) return fail(404, { error: 'Conversation not found.' });

    const { error: deleteError } = await client.from('chat_subjects').delete().eq('id', subjectId).eq('project_id', access.project.id);
    if (deleteError) return fail(400, { error: deleteError.message });
    return { ok: true };
  },

  deleteMessage: async (event) => {
    const form = await event.request.formData();
    const messageId = formString(form, 'messageId');
    if (!messageId) return fail(400, { error: 'Choose a message to delete.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin'],
      action: 'delete project chat messages'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });

    const client = privilegedClient(event);
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const { data: message, error: messageError } = await client
      .from('chat_messages')
      .select('id, subject_id')
      .eq('id', messageId)
      .maybeSingle();
    if (messageError) return fail(400, { error: messageError.message });
    if (!message) return fail(404, { error: 'Message not found.' });

    const { data: subject, error: subjectError } = await client
      .from('chat_subjects')
      .select('id')
      .eq('id', message.subject_id)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (subjectError) return fail(400, { error: subjectError.message });
    if (!subject) return fail(404, { error: 'Conversation not found.' });

    const { error: deleteError } = await client.from('chat_messages').delete().eq('id', messageId);
    if (deleteError) return fail(400, { error: deleteError.message });
    return { ok: true };
  }
};
