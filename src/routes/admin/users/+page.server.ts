import { fail } from '@sveltejs/kit';
import { formString, requireSuperadmin } from '$lib/server/auth';
import { sendPortalEmail } from '$lib/server/email';
import { listAdminProjects, listAdminUsers } from '$lib/server/queries';
import { createAdminClient } from '$lib/server/supabase-admin';
import type { Actions, PageServerLoad } from './$types';

const memberRoles = new Set(['admin', 'member', 'guest', 'readonly']);

function roleValue(value: string) {
  return memberRoles.has(value) ? value : 'member';
}

function checked(form: FormData, name: string) {
  return form.get(name) === 'on';
}

function fullNameMetadata(fullName: string | null) {
  return fullName ? { full_name: fullName } : undefined;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(users.error.message);
  return users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function generateAuthLink(admin: ReturnType<typeof createAdminClient>, type: 'invite' | 'magiclink', email: string, redirectTo: string, fullName?: string | null) {
  const result = await admin.auth.admin.generateLink({
    type,
    email,
    options: {
      redirectTo,
      data: fullNameMetadata(fullName ?? null)
    }
  } as never);

  if (result.error) throw new Error(result.error.message);
  return {
    user: result.data.user,
    actionLink: result.data.properties?.action_link as string | undefined
  };
}

async function sendUserAccessEmail({
  to,
  fullName,
  actionUrl,
  loginUrl,
  projectName,
  tempPassword
}: {
  to: string;
  fullName?: string | null;
  actionUrl?: string;
  loginUrl: string;
  projectName?: string | null;
  tempPassword?: string;
}) {
  const greeting = fullName ? `Hi ${fullName},` : 'Hi,';
  const targetUrl = actionUrl || loginUrl;
  const projectLine = projectName ? `<p>You now have access to <strong>${projectName}</strong>.</p>` : '';
  const passwordLine = tempPassword ? `<p>Your temporary password is: <strong>${tempPassword}</strong></p>` : '';
  return sendPortalEmail({
    to,
    subject: projectName ? `Project portal access: ${projectName}` : 'Pueblo Electric project portal access',
    html: `
      <p>${greeting}</p>
      ${projectLine}
      <p>Pueblo Electric has added you to the project portal.</p>
      ${passwordLine}
      <p><a href="${targetUrl}">Open the Pueblo Electric project portal</a></p>
      <p>If the button does not work, copy and paste this link into your browser:<br>${targetUrl}</p>
    `
  });
}

async function projectNameFor(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  if (!projectId) return null;
  const { data } = await admin.from('projects').select('name').eq('id', projectId).maybeSingle();
  return data?.name ?? null;
}

export const load: PageServerLoad = async () => {
  const [users, projects] = await Promise.all([listAdminUsers(), listAdminProjects()]);
  return { users, projects };
};

export const actions: Actions = {
  createUser: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const email = formString(form, 'email').toLowerCase();
    const password = formString(form, 'password');
    const fullName = formString(form, 'fullName') || null;
    const company = formString(form, 'company') || null;
    const title = formString(form, 'title') || null;
    const projectId = formString(form, 'projectId');
    const role = roleValue(formString(form, 'role'));
    const sendEmail = checked(form, 'sendEmail');

    if (!email) return fail(400, { error: 'Email is required.' });
    if (password && password.length < 8) return fail(400, { error: 'Temporary password must be at least 8 characters.' });

    const admin = createAdminClient();
    const redirectTo = `${event.url.origin}/auth/callback?next=${encodeURIComponent(projectId ? `/projects` : '/')}`;
    const loginUrl = `${event.url.origin}/login`;
    const existing = await findAuthUserByEmail(admin, email);
    let userId = existing?.id;
    let actionLink: string | undefined;

    if (existing && password) {
      const updated = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: fullNameMetadata(fullName)
      });
      if (updated.error) return fail(400, { error: updated.error.message });
      userId = updated.data.user.id;
    } else if (!existing && password) {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: fullNameMetadata(fullName)
      });
      if (created.error || !created.data.user) return fail(400, { error: created.error?.message ?? 'Could not create user.' });
      userId = created.data.user.id;
    } else if (!existing) {
      try {
        const generated = await generateAuthLink(admin, 'invite', email, redirectTo, fullName);
        userId = generated.user.id;
        actionLink = generated.actionLink;
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not generate invite link.' });
      }
    } else if (sendEmail) {
      try {
        const generated = await generateAuthLink(admin, 'magiclink', email, redirectTo, fullName);
        actionLink = generated.actionLink;
      } catch {
        actionLink = undefined;
      }
    }

    if (!userId) return fail(400, { error: 'Could not create or locate this user.' });
    const profile = await admin.from('profiles').upsert({ id: userId, email, full_name: fullName, company, title }, { onConflict: 'id' });
    if (profile.error) return fail(400, { error: profile.error.message });

    if (projectId) {
      const membership = await admin.from('project_members').upsert({ project_id: projectId, user_id: userId, role, accepted_at: new Date().toISOString() }, { onConflict: 'project_id,user_id' });
      if (membership.error) return fail(400, { error: membership.error.message });
    }

    const projectName = await projectNameFor(admin, projectId);
    const emailResult = sendEmail
      ? await sendUserAccessEmail({
          to: email,
          fullName,
          actionUrl: actionLink,
          loginUrl,
          projectName,
          tempPassword: password || undefined
        })
      : { skipped: true };

    const emailSkipped = sendEmail && 'skipped' in emailResult;

    return {
      ok: true,
      message: sendEmail ? (emailSkipped ? 'User saved. Email service is not configured yet, so use the invite link below.' : 'User saved and email sent.') : 'User saved.',
      inviteLink: actionLink,
      emailSkipped
    };
  },

  assignProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    const projectId = formString(form, 'projectId');
    const role = roleValue(formString(form, 'role'));
    const sendEmail = checked(form, 'sendEmail');

    if (!userId || !projectId) return fail(400, { error: 'Choose a user and project before assigning access.' });

    const admin = createAdminClient();
    const { error } = await admin.from('project_members').upsert(
      {
        project_id: projectId,
        user_id: userId,
        role,
        accepted_at: new Date().toISOString()
      },
      { onConflict: 'project_id,user_id' }
    );

    if (error) return fail(400, { error: error.message });

    let emailSkipped = false;
    if (sendEmail) {
      const [user, project] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from('projects').select('name').eq('id', projectId).maybeSingle()
      ]);
      const authUser = user.data.user;
      const email = authUser?.email;
      if (authUser && email) {
        const emailResult = await sendUserAccessEmail({
          to: email,
          fullName: (authUser.user_metadata?.full_name as string | undefined) ?? null,
          loginUrl: `${event.url.origin}/login`,
          projectName: project.data?.name ?? null
        });
        emailSkipped = 'skipped' in emailResult;
      }
    }

    return {
      ok: true,
      message: sendEmail ? (emailSkipped ? 'Access granted. Email service is not configured yet.' : 'Access granted and email sent.') : 'Access granted.',
      emailSkipped
    };
  },

  emailUser: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    if (!userId) return fail(400, { error: 'Choose a user before sending email.' });

    const admin = createAdminClient();
    const user = await admin.auth.admin.getUserById(userId);
    if (user.error || !user.data.user?.email) return fail(400, { error: user.error?.message ?? 'User email not found.' });

    const authUser = user.data.user;
    if (!authUser) return fail(400, { error: 'User email not found.' });

    const email = authUser.email;
    if (!email) return fail(400, { error: 'User email not found.' });
    let actionLink: string | undefined;
    try {
      const generated = await generateAuthLink(admin, 'magiclink', email, `${event.url.origin}/auth/callback?next=/`, null);
      actionLink = generated.actionLink;
    } catch {
      actionLink = undefined;
    }

    const result = await sendUserAccessEmail({
      to: email,
      fullName: (authUser.user_metadata?.full_name as string | undefined) ?? null,
      actionUrl: actionLink,
      loginUrl: `${event.url.origin}/login`
    });

    return {
      ok: true,
      message: 'Access email prepared.',
      inviteLink: actionLink,
      emailSkipped: 'skipped' in result
    };
  },

  removeProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    const projectId = formString(form, 'projectId');

    if (!userId || !projectId) return fail(400, { error: 'Choose a user and project before removing access.' });

    const admin = createAdminClient();
    const { error } = await admin
      .from('project_members')
      .delete()
      .eq('project_id', projectId)
      .eq('user_id', userId);

    if (error) return fail(400, { error: error.message });
    return { ok: true };
  }
};
