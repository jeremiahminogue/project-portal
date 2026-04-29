import { fail } from '@sveltejs/kit';
import { formString } from '$lib/server/auth';
import { sendPortalEmail, textToHtml } from '$lib/server/email';
import {
  existingFileAttachmentsFor,
  formHasItemAttachments,
  mergeItemAttachments,
  uploadedItemAttachmentsFor,
  type ItemAttachment
} from '$lib/server/item-attachments';
import { databaseClientForProjectAccess, isProjectAccessError, projectRoleCapabilities, requireProjectAccess } from '$lib/server/project-access';
import { getDirectory, getFiles, getProject, getUpdates } from '$lib/server/queries';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const [project, updates, directory, files] = await Promise.all([
    getProject(event, event.params.slug),
    getUpdates(event, event.params.slug),
    getDirectory(event, event.params.slug),
    getFiles(event, event.params.slug)
  ]);
  const access = event.locals.supabase ? await requireProjectAccess(event, event.params.slug) : null;
  const role = access && !isProjectAccessError(access) ? access.role : null;
  return {
    project,
    updates,
    directory,
    files,
    updateAccess: {
      canPost: role ? projectRoleCapabilities[role].canCreateCommunication : !event.locals.supabase,
      canAttachFiles: role ? projectRoleCapabilities[role].canUploadFiles : !event.locals.supabase
    }
  };
};

export const actions: Actions = {
  postUpdate: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });

    const form = await event.request.formData();
    const access = await requireProjectAccess(event, event.params.slug, {
      writable: true,
      action: 'post updates for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return fail(400, { error: 'Supabase is not configured yet.' });
    if (formHasItemAttachments(form) && !projectRoleCapabilities[access.role].canUploadFiles) {
      return fail(403, { error: 'Not authorized to attach files to this project.' });
    }

    const title = formString(form, 'title');
    const body = formString(form, 'body');
    const kind = formString(form, 'kind') || 'general';
    const notify = form.get('notify') === 'on';
    const attachmentIds = form.getAll('attachmentIds').filter((value): value is string => typeof value === 'string');

    if (!title || !body) return fail(400, { error: 'Title and body are required.' });

    let attachments: ItemAttachment[] = [];
    try {
      attachments = mergeItemAttachments(
        await existingFileAttachmentsFor(projectClient, access.project.id, attachmentIds),
        await uploadedItemAttachmentsFor({
          event,
          access,
          form,
          folderName: 'Update Attachments'
        })
      );
    } catch (error) {
      return fail(400, { error: error instanceof Error ? error.message : 'Could not attach selected files.' });
    }

    const { error } = await projectClient.from('updates').insert({
      project_id: access.project.id,
      title,
      body,
      kind,
      attachments_json: attachments,
      author_id: access.user.id
    });
    if (error) return fail(400, { error: error.message });

    if (notify) {
      const directory = await getDirectory(event, event.params.slug);
      await sendPortalEmail({
        to: directory.map((person) => person.email).filter(Boolean) as string[],
        subject: `Project update: ${title}`,
        html: textToHtml(body)
      });
    }

    return { ok: true };
  },

  addComment: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });
    const form = await event.request.formData();
    const updateId = formString(form, 'updateId');
    const body = formString(form, 'body');
    if (!updateId || !body) return fail(400, { error: 'Comment is required.' });

    const access = await requireProjectAccess(event, event.params.slug, {
      roles: ['superadmin', 'admin', 'member', 'guest'],
      action: 'comment on updates for this project'
    });
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return fail(400, { error: 'Supabase is not configured yet.' });

    const { data: update, error: updateError } = await projectClient
      .from('updates')
      .select('id')
      .eq('id', updateId)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (updateError) return fail(400, { error: updateError.message });
    if (!update) return fail(404, { error: 'Update not found.' });

    const { error } = await projectClient.from('update_comments').insert({
      update_id: updateId,
      author_id: access.user.id,
      body
    });
    if (error) return fail(400, { error: error.message });
    return { ok: true };
  },

  toggleLike: async (event) => {
    const client = event.locals.supabase;
    if (!client) return fail(400, { error: 'Supabase is not configured yet.' });
    const form = await event.request.formData();
    const updateId = formString(form, 'updateId');
    if (!updateId) return fail(400, { error: 'Update is required.' });

    const access = await requireProjectAccess(event, event.params.slug);
    if (isProjectAccessError(access)) return fail(access.status, { error: access.message });
    const projectClient = databaseClientForProjectAccess(event, access);
    if (!projectClient) return fail(400, { error: 'Supabase is not configured yet.' });
    const { data: update, error: updateError } = await projectClient
      .from('updates')
      .select('id')
      .eq('id', updateId)
      .eq('project_id', access.project.id)
      .maybeSingle();
    if (updateError) return fail(400, { error: updateError.message });
    if (!update) return fail(404, { error: 'Update not found.' });

    const { data: existing, error: existingError } = await projectClient
      .from('update_likes')
      .select('update_id')
      .eq('update_id', updateId)
      .eq('user_id', access.user.id)
      .maybeSingle();
    if (existingError) return fail(400, { error: existingError.message });

    if (existing) {
      const { error } = await projectClient.from('update_likes').delete().eq('update_id', updateId).eq('user_id', access.user.id);
      if (error) return fail(400, { error: error.message });
    } else {
      const { error } = await projectClient.from('update_likes').insert({ update_id: updateId, user_id: access.user.id });
      if (error) return fail(400, { error: error.message });
    }

    return { ok: true };
  }
};
