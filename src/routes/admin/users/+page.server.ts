import { fail } from '@sveltejs/kit';
import { formString, requireSuperadmin } from '$lib/server/auth';
import { writeAdminAudit } from '$lib/server/admin-audit';
import { escapeHtml, sendPortalEmail } from '$lib/server/email';
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

function safeNext(next: string) {
  if (!next.startsWith('/') || next.startsWith('//')) return '/';
  if (next.startsWith('/auth/callback')) return '/';
  return next;
}

function authCallbackUrl(origin: string, next: string) {
  return `${origin}/auth/callback?next=${encodeURIComponent(safeNext(next))}`;
}

function portalActionLink(origin: string, next: string, tokenHash: string | undefined, type: 'invite' | 'magiclink') {
  if (!tokenHash) return undefined;
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type,
    next: safeNext(next)
  });
  return `${origin}/auth/callback?${params.toString()}`;
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw new Error(users.error.message);
  return users.data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase()) ?? null;
}

async function generateAuthLink(
  admin: ReturnType<typeof createAdminClient>,
  type: 'invite' | 'magiclink',
  email: string,
  origin: string,
  next: string,
  fullName?: string | null
) {
  const result = await admin.auth.admin.generateLink({
    type,
    email,
    options: {
      redirectTo: authCallbackUrl(origin, next),
      data: fullNameMetadata(fullName ?? null)
    }
  } as never);

  if (result.error) throw new Error(result.error.message);
  return {
    user: result.data.user,
    actionLink:
      portalActionLink(origin, next, result.data.properties?.hashed_token as string | undefined, type) ??
      (result.data.properties?.action_link as string | undefined)
  };
}

async function sendUserAccessEmail({
  to,
  fullName,
  actionUrl,
  loginUrl,
  projectName
}: {
  to: string;
  fullName?: string | null;
  actionUrl?: string;
  loginUrl: string;
  projectName?: string | null;
}) {
  const greeting = fullName ? `Hi ${escapeHtml(fullName)},` : 'Hi,';
  const targetUrl = actionUrl || loginUrl;
  const projectLine = projectName ? `<p>You now have access to <strong>${escapeHtml(projectName)}</strong>.</p>` : '';
  const safeTargetUrl = escapeHtml(targetUrl);
  return sendPortalEmail({
    to,
    subject: projectName ? `Project portal access: ${projectName}` : 'Pueblo Electric project portal access',
    html: `
      <p>${greeting}</p>
      ${projectLine}
      <p>Pueblo Electric has added you to the project portal.</p>
      <p><a href="${safeTargetUrl}">Open the Pueblo Electric project portal</a></p>
      <p>If the button does not work, copy and paste this link into your browser:<br>${safeTargetUrl}</p>
    `
  });
}

function emailDeliveryState(result: Awaited<ReturnType<typeof sendPortalEmail>>) {
  return {
    skipped: Boolean(result && typeof result === 'object' && 'skipped' in result),
    failed: Boolean(result && typeof result === 'object' && 'error' in result)
  };
}

async function projectNameFor(admin: ReturnType<typeof createAdminClient>, projectId: string) {
  if (!projectId) return null;
  const { data } = await admin.from('projects').select('name').eq('id', projectId).maybeSingle();
  return data?.name ?? null;
}

export const load: PageServerLoad = async (event) => {
  await requireSuperadmin(event);
  const [users, projects] = await Promise.all([listAdminUsers(), listAdminProjects()]);
  return { users, projects };
};

export const actions: Actions = {
  createUser: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const email = formString(form, 'email').toLowerCase();
    const fullName = formString(form, 'fullName') || null;
    const company = formString(form, 'company') || null;
    const title = formString(form, 'title') || null;
    const projectId = formString(form, 'projectId');
    const role = roleValue(formString(form, 'role'));
    const sendEmail = checked(form, 'sendEmail');

    if (!email) return fail(400, { error: 'Email is required.' });

    const admin = createAdminClient();
    const next = projectId ? '/projects' : '/';
    const loginUrl = `${event.url.origin}/login`;
    const existing = await findAuthUserByEmail(admin, email);
    let userId = existing?.id;
    let actionLink: string | undefined;

    if (!existing) {
      try {
        const generated = await generateAuthLink(admin, 'invite', email, event.url.origin, '/reset-password', fullName);
        userId = generated.user.id;
        actionLink = generated.actionLink;
      } catch (error) {
        return fail(400, { error: error instanceof Error ? error.message : 'Could not generate invite link.' });
      }
    } else if (sendEmail) {
      try {
        const generated = await generateAuthLink(admin, 'magiclink', email, event.url.origin, next, fullName);
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
          projectName
        })
      : { skipped: true };

    const delivery = emailDeliveryState(emailResult);

    await writeAdminAudit(event, existing ? 'user.update_or_invite' : 'user.create', 'user', userId, {
      email,
      projectId: projectId || null,
      role,
      emailSent: sendEmail && !delivery.skipped && !delivery.failed
    });

    return {
      ok: true,
      message: sendEmail
        ? delivery.skipped
          ? 'User saved. Email service is not configured yet, so use the invite link below.'
          : delivery.failed
            ? 'User saved, but the access email failed to send. Use the invite link below.'
            : 'User saved and email sent.'
        : 'User saved.',
      inviteLink: actionLink,
      emailSkipped: delivery.skipped,
      emailFailed: delivery.failed
    };
  },

  assignProject: async (event) => {
    await requireSuperadmin(event);
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    const projectId = formString(form, 'projectId');
    const role = roleValue(formString(form, 'role'));
    const sendEmail = checked(form, 'sendEmail');
    const isSubmittalManager = checked(form, 'isSubmittalManager');
    const isRfiManager = checked(form, 'isRfiManager');

    if (!userId || !projectId) return fail(400, { error: 'Choose a user and project before assigning access.' });

    const admin = createAdminClient();
    const { error } = await admin.from('project_members').upsert(
      {
        project_id: projectId,
        user_id: userId,
        role,
        is_submittal_manager: isSubmittalManager,
        is_rfi_manager: isRfiManager,
        accepted_at: new Date().toISOString()
      },
      { onConflict: 'project_id,user_id' }
    );

    if (error) return fail(400, { error: error.message });
    await writeAdminAudit(event, 'membership.upsert', 'user', userId, {
      projectId,
      role,
      isSubmittalManager,
      isRfiManager
    });

    let emailSkipped = false;
    if (sendEmail) {
      const [user, project] = await Promise.all([
        admin.auth.admin.getUserById(userId),
        admin.from('projects').select('name').eq('id', projectId).maybeSingle()
      ]);
      const authUser = user.data.user;
      const email = authUser?.email;
      if (authUser && email) {
        let actionLink: string | undefined;
        try {
          const generated = await generateAuthLink(
            admin,
            'magiclink',
            email,
            event.url.origin,
            '/projects',
            (authUser.user_metadata?.full_name as string | undefined) ?? null
          );
          actionLink = generated.actionLink;
        } catch {
          actionLink = undefined;
        }
        const emailResult = await sendUserAccessEmail({
          to: email,
          fullName: (authUser.user_metadata?.full_name as string | undefined) ?? null,
          actionUrl: actionLink,
          loginUrl: `${event.url.origin}/login`,
          projectName: project.data?.name ?? null
        });
        const delivery = emailDeliveryState(emailResult);
        emailSkipped = delivery.skipped || delivery.failed;
      }
    }

    return {
      ok: true,
      message: sendEmail ? (emailSkipped ? 'Access granted. Access email was not sent.' : 'Access granted and email sent.') : 'Access granted.',
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
      const generated = await generateAuthLink(admin, 'magiclink', email, event.url.origin, '/', null);
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
    await writeAdminAudit(event, 'user.email_access', 'user', userId, { email });

    return {
      ok: true,
      message: 'Access email prepared.',
      inviteLink: actionLink,
      emailSkipped: emailDeliveryState(result).skipped,
      emailFailed: emailDeliveryState(result).failed
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
    await writeAdminAudit(event, 'membership.remove', 'user', userId, { projectId });
    return { ok: true };
  },

  deleteUser: async (event) => {
    const me = await requireSuperadmin(event);
    const form = await event.request.formData();
    const userId = formString(form, 'userId');
    const email = formString(form, 'email').toLowerCase();
    const confirmEmail = formString(form, 'confirmEmail').toLowerCase();

    if (!userId || !email || confirmEmail !== email) {
      return fail(400, { error: 'Type the user email exactly before deleting.' });
    }
    if (me.user.id === userId) {
      return fail(400, { error: 'You cannot delete your own account from here.' });
    }

    const admin = createAdminClient();
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (deleted.error) return fail(400, { error: deleted.error.message });
    await writeAdminAudit(event, 'user.delete', 'user', userId, { email });
    return { ok: true };
  }
};
