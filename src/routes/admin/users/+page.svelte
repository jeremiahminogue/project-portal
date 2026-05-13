<script lang="ts">
  import { enhance } from '$app/forms';
  import { Copy, Mail, Pencil, Plus, Send, ShieldCheck, Trash2, UserPlus, X } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';

  let { data, form } = $props();
  let createOpen = $state(true);
  let deleteUserId = $state('');
  // Inline edit-membership state. Keyed by `${userId}:${projectId}` so two
  // users can't have edit panels open against the same project at once.
  let editingMembership = $state('');

  function membershipKey(userId: string, projectId: string) {
    return `${userId}:${projectId}`;
  }
  function toggleEdit(userId: string, projectId: string) {
    const key = membershipKey(userId, projectId);
    editingMembership = editingMembership === key ? '' : key;
  }

  function roleLabel(role: string) {
    if (role === 'admin') return 'Project admin';
    if (role === 'member') return 'Member';
    if (role === 'guest') return 'Guest';
    if (role === 'readonly') return 'Read-only';
    return role || 'Member';
  }

  function highestAccess(user: (typeof data.users)[number]) {
    if (user.isSuperadmin) return { label: 'Portal admin', detail: 'Full admin console access', tone: 'superadmin' };
    if (user.projects.some((project) => project.role === 'admin')) return { label: 'Project admin', detail: 'Can manage assigned projects', tone: 'admin' };
    if (user.projects.some((project) => project.role === 'member')) return { label: 'Member', detail: 'Can work assigned projects', tone: 'member' };
    if (user.projects.some((project) => project.role === 'guest')) return { label: 'Guest', detail: 'View, download, and markup', tone: 'guest' };
    if (user.projects.some((project) => project.role === 'readonly')) return { label: 'Read-only', detail: 'View and download only', tone: 'readonly' };
    return { label: 'No access', detail: 'No project assignments', tone: 'none' };
  }

  function projectCountLabel(count: number) {
    return `${count} project${count === 1 ? '' : 's'}`;
  }

  async function copyInviteLink() {
    if (!form?.inviteLink) return;
    await navigator.clipboard?.writeText(form.inviteLink);
  }
</script>

<svelte:head>
  <title>Admin Users | Pueblo Electric Project Portal</title>
</svelte:head>

<PageShell wide>
  <div class="admin-heading">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Admin</p>
      <h1>Users</h1>
      <p>Create portal access, send invite emails, and assign users to projects.</p>
    </div>
    <button class="btn btn-primary" type="button" onclick={() => (createOpen = !createOpen)}>
      <UserPlus size={16} />
      {createOpen ? 'Close invite' : 'Invite user'}
    </button>
  </div>

  {#if form?.error}
    <div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="mb-4 rounded-lg border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">
      {form.message ?? 'Saved.'}
      {#if form.emailSkipped}
        <span class="ml-1 text-pe-sub">Email service is not configured, so no email was sent.</span>
      {/if}
      {#if form.emailFailed}
        <span class="ml-1 text-pe-sub">The email provider returned an error.</span>
      {/if}
    </div>
  {/if}
  {#if form?.inviteLink}
    <div class="invite-link-panel">
      <div>
        <strong>Invite link</strong>
        <span>{form.inviteLink}</span>
      </div>
      <button class="btn btn-secondary" type="button" onclick={copyInviteLink}>
        <Copy size={16} />
        Copy
      </button>
    </div>
  {/if}
  {#if !data.managerFlagsAvailable}
    <div class="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
      Submittal and RFI manager flags will appear after the database update is applied.
    </div>
  {/if}

  {#if createOpen}
    <form class="invite-panel" method="post" action="?/createUser" use:enhance>
      <div class="invite-panel-title">
        <div>
          <h2>Invite or add user</h2>
          <p>Send a secure invite or access link. Users set their own credentials through Supabase.</p>
        </div>
        <label class="send-toggle">
          <input type="checkbox" name="sendEmail" checked />
          <span>Email user</span>
        </label>
      </div>

      <div class="invite-grid">
        <div class="field-block required"><label class="label" for="email">Email</label><input id="email" class="field" name="email" type="email" autocomplete="email" placeholder="client@company.com" required /></div>
        <div class="field-block"><label class="label" for="fullName">Full name</label><input id="fullName" class="field" name="fullName" autocomplete="name" placeholder="Jane Reviewer" /></div>
        <div class="field-block"><label class="label" for="company">Company</label><input id="company" class="field" name="company" placeholder="Owner, architect, subcontractor..." /></div>
        <div class="field-block"><label class="label" for="title">Title</label><input id="title" class="field" name="title" placeholder="Project manager" /></div>
        <div class="field-block wide"><label class="label" for="projectId">Project access</label><select id="projectId" class="field" name="projectId"><option value="">No project yet</option>{#each data.projects as project}<option value={project.id}>#{project.slug} {project.name}</option>{/each}</select></div>
        <div class="field-block"><label class="label" for="role">Project role</label><select id="role" class="field" name="role"><option value="member">Member</option><option value="admin">Admin</option><option value="guest">Guest</option><option value="readonly">Read-only</option></select></div>
      </div>

      <div class="invite-actions">
        <div class="invite-note">
          <ShieldCheck size={16} />
          Users receive an invite or magic link by email. Temporary passwords are not created or sent.
        </div>
        <button class="btn btn-primary" type="submit">
          <Send size={16} />
          Save and invite
        </button>
      </div>
    </form>
  {/if}

  <section class="user-directory">
    <div class="directory-toolbar">
      <h2>Portal users</h2>
      <span>{data.users.length} users</span>
    </div>

    <div class="user-grid">
      {#each data.users as user}
        {@const access = highestAccess(user)}
        <article class="user-card">
          <div class="user-card-head">
            <div class="min-w-0">
              <h3>{user.fullName ?? user.email}</h3>
              <a href={`mailto:${user.email}`}>{user.email}</a>
              <p>{user.company ?? 'No company'} {user.title ? `- ${user.title}` : ''}</p>
            </div>
            <div class="access-summary">
              <span class={`access-level ${access.tone}`}>
                <ShieldCheck size={14} />
                {access.label}
              </span>
              <span class="access-detail">{access.detail}</span>
            </div>
          </div>

          <div class="user-access-meta" aria-label={`Access summary for ${user.email}`}>
            <div>
              <span class="meta-label">Sign-in</span>
              <StatusPill label={user.emailConfirmed ? 'Confirmed' : 'Pending'} />
            </div>
            <div>
              <span class="meta-label">Project access</span>
              <strong>{projectCountLabel(user.projectCount)}</strong>
            </div>
            <div>
              <span class="meta-label">Admin console</span>
              <strong>{user.isSuperadmin ? 'Yes' : 'No'}</strong>
            </div>
          </div>

          <div class="project-access-list">
            <div class="project-access-title">
              <span>Project access</span>
              <span>{projectCountLabel(user.projectCount)}</span>
            </div>
            {#each user.projects as project}
              {@const key = membershipKey(user.id, project.id)}
              <div class="project-access-row">
                <div class="project-access-main">
                  <strong>#{project.slug}</strong>
                  <span>{project.name}</span>
                </div>
                <div class="project-access-badges">
                  <span class={`role-badge ${project.role}`}>{roleLabel(project.role)}</span>
                  {#if data.managerFlagsAvailable && project.isSubmittalManager}
                    <span class="manager-badge is-submittal" title="Submittal manager on this project">Submittals</span>
                  {/if}
                  {#if data.managerFlagsAvailable && project.isRfiManager}
                    <span class="manager-badge is-rfi" title="RFI manager on this project">RFIs</span>
                  {/if}
                </div>
                <div class="project-access-actions">
                  <button
                    type="button"
                    class="chip-icon"
                    aria-label={`Edit ${user.email} on ${project.name}`}
                    title={data.managerFlagsAvailable ? 'Edit role + manager flags' : 'Edit role'}
                    onclick={() => toggleEdit(user.id, project.id)}
                  >
                    <Pencil size={13} />
                  </button>
                  <form method="post" action="?/removeProject" use:enhance>
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <button type="submit" class="chip-icon is-danger" aria-label={`Remove ${user.email} from ${project.name}`} title="Remove from project">
                      <X size={13} />
                    </button>
                  </form>
                </div>
                {#if editingMembership === key}
                  <form
                    class="membership-edit"
                    method="post"
                    action="?/updateMembership"
                    use:enhance={() => async ({ result, update }) => {
                      await update();
                      if (result.type === 'success') editingMembership = '';
                    }}
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <label class="me-field">
                      <span>Role</span>
                      <select class="field" name="role">
                        <option value="member" selected={project.role === 'member'}>Member</option>
                        <option value="admin" selected={project.role === 'admin'}>Admin</option>
                        <option value="guest" selected={project.role === 'guest'}>Guest</option>
                        <option value="readonly" selected={project.role === 'readonly'}>Read-only</option>
                      </select>
                    </label>
                    {#if data.managerFlagsAvailable}
                      <label class="mini-check"><input type="checkbox" name="isSubmittalManager" checked={project.isSubmittalManager} /> Submittal manager</label>
                      <label class="mini-check"><input type="checkbox" name="isRfiManager" checked={project.isRfiManager} /> RFI manager</label>
                    {/if}
                    <div class="me-actions">
                      <button class="btn btn-ghost" type="button" onclick={() => (editingMembership = '')}>Cancel</button>
                      <button class="btn btn-primary" type="submit">Save</button>
                    </div>
                  </form>
                {/if}
              </div>
            {:else}
              <div class="empty-projects">No projects assigned</div>
            {/each}
          </div>

          <div class="user-card-actions">
            <form class="assign-form" method="post" action="?/assignProject" use:enhance>
              <input type="hidden" name="userId" value={user.id} />
              <select class="field" name="projectId" aria-label={`Project for ${user.email}`} required>
                <option value="">Assign project</option>
                {#each data.projects as project}
                  <option value={project.id}>#{project.slug} {project.name}</option>
                {/each}
              </select>
              <select class="field" name="role" aria-label={`Project role for ${user.email}`}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="guest">Guest</option>
                <option value="readonly">Read-only</option>
              </select>
              {#if data.managerFlagsAvailable}
                <label class="mini-check" title="User can route incoming submittals on this project"><input type="checkbox" name="isSubmittalManager" /> Submittal manager</label>
                <label class="mini-check" title="User can manage RFIs on this project"><input type="checkbox" name="isRfiManager" /> RFI manager</label>
              {/if}
              <label class="mini-check"><input type="checkbox" name="sendEmail" /> Email</label>
              <button class="btn btn-secondary" type="submit" aria-label={`Assign project to ${user.email}`}>
                <Plus size={14} />
                Grant
              </button>
            </form>

            <form method="post" action="?/emailUser" use:enhance>
              <input type="hidden" name="userId" value={user.id} />
              <button class="btn btn-ghost email-button" type="submit">
                <Mail size={15} />
                Email access
              </button>
            </form>

            <button class="btn btn-ghost email-button danger-text" type="button" onclick={() => (deleteUserId = deleteUserId === user.id ? '' : user.id)}>
              <Trash2 size={15} />
              Delete user
            </button>
          </div>

          {#if deleteUserId === user.id}
            <form class="delete-user-form" method="post" action="?/deleteUser" use:enhance>
              <input type="hidden" name="userId" value={user.id} />
              <input type="hidden" name="email" value={user.email} />
              <label class="label" for={`delete-user-${user.id}`}>Type {user.email} to delete this user</label>
              <div>
                <input id={`delete-user-${user.id}`} class="field" name="confirmEmail" autocomplete="off" />
                <button class="btn bg-red-700 text-white hover:bg-red-800" type="submit">Delete</button>
              </div>
            </form>
          {/if}
        </article>
      {/each}
    </div>
  </section>
</PageShell>

<style>
  .admin-heading {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .admin-heading h1 {
    margin: 0.2rem 0 0;
    color: #191b19;
    font-size: 2rem;
    font-weight: 900;
  }

  .admin-heading p {
    margin-top: 0.35rem;
    color: #59615a;
    font-size: 0.9rem;
  }

  .invite-panel,
  .invite-link-panel,
  .user-card {
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.5rem;
    background: #fff;
    box-shadow: 0 16px 42px -38px rgba(0, 0, 0, 0.42);
  }

  .invite-panel {
    display: grid;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 1rem;
  }

  .invite-panel-title,
  .invite-actions,
  .invite-link-panel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .invite-panel-title h2,
  .directory-toolbar h2 {
    margin: 0;
    color: #191b19;
    font-size: 1rem;
    font-weight: 900;
  }

  .invite-panel-title p,
  .invite-note,
  .directory-toolbar span {
    margin-top: 0.2rem;
    color: #606860;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .send-toggle,
  .mini-check,
  .invite-note {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .send-toggle {
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.45rem;
    padding: 0.55rem 0.7rem;
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .invite-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .field-block.wide {
    grid-column: span 2;
  }

  .invite-link-panel {
    margin-bottom: 1rem;
    padding: 0.8rem;
  }

  .invite-link-panel div {
    min-width: 0;
  }

  .invite-link-panel strong,
  .invite-link-panel span {
    display: block;
  }

  .invite-link-panel strong {
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .invite-link-panel span {
    overflow: hidden;
    color: #59615a;
    font-size: 0.78rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .directory-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 1.2rem 0 0.65rem;
  }

  .user-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.8rem;
  }

  .user-card {
    display: grid;
    gap: 0.8rem;
    padding: 1rem;
  }

  .user-card-head {
    display: flex;
    align-items: start;
    justify-content: space-between;
    gap: 0.8rem;
  }

  .user-card h3 {
    margin: 0;
    overflow: hidden;
    color: #191b19;
    font-size: 0.98rem;
    font-weight: 900;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .user-card a {
    display: block;
    margin-top: 0.18rem;
    overflow-wrap: anywhere;
    color: #1d5fb8;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: underline;
  }

  .user-card p {
    margin-top: 0.28rem;
    color: #606860;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .access-summary {
    display: grid;
    justify-items: end;
    gap: 0.2rem;
    min-width: 9rem;
  }

  .access-level,
  .role-badge,
  .manager-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    font-weight: 900;
    line-height: 1;
    white-space: nowrap;
  }

  .access-level {
    gap: 0.32rem;
    min-height: 1.75rem;
    padding: 0.36rem 0.7rem;
    font-size: 0.76rem;
  }

  .access-level.superadmin {
    background: rgba(20, 146, 52, 0.14);
    color: #176d2e;
  }

  .access-level.admin {
    background: rgba(29, 95, 184, 0.13);
    color: #1e518e;
  }

  .access-level.member {
    background: rgba(25, 27, 25, 0.09);
    color: #303730;
  }

  .access-level.guest,
  .access-level.readonly,
  .access-level.none {
    background: rgba(91, 99, 91, 0.12);
    color: #5b635b;
  }

  .access-detail {
    color: #6c746c;
    font-size: 0.72rem;
    font-weight: 750;
    text-align: right;
  }

  .user-access-meta {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    border: 1px solid rgba(25, 27, 25, 0.08);
    border-radius: 0.45rem;
    background: #f8faf8;
    padding: 0.6rem;
  }

  .user-access-meta div {
    display: grid;
    align-content: start;
    gap: 0.22rem;
    min-width: 0;
  }

  .meta-label {
    color: #6b746b;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .user-access-meta strong {
    color: #252a25;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .project-access-list {
    display: grid;
    gap: 0.45rem;
  }

  .project-access-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.8rem;
    color: #4f594f;
    font-size: 0.72rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .project-access-title span:last-child {
    color: #717971;
    font-size: 0.68rem;
  }

  .project-access-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.55rem;
    border: 1px solid rgba(25, 27, 25, 0.09);
    border-radius: 0.45rem;
    background: #fff;
    padding: 0.55rem;
  }

  .project-access-main {
    display: grid;
    min-width: 0;
  }

  .project-access-main strong {
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 900;
  }

  .project-access-main span {
    overflow: hidden;
    color: #626a62;
    font-size: 0.74rem;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-access-badges,
  .project-access-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    min-width: 0;
  }

  .role-badge,
  .manager-badge {
    min-height: 1.45rem;
    padding: 0.28rem 0.52rem;
    font-size: 0.66rem;
  }

  .role-badge.admin {
    background: rgba(29, 95, 184, 0.13);
    color: #1e518e;
  }

  .role-badge.member {
    background: rgba(20, 146, 52, 0.12);
    color: #176d2e;
  }

  .role-badge.guest,
  .role-badge.readonly {
    background: rgba(91, 99, 91, 0.12);
    color: #5b635b;
  }

  .manager-badge.is-submittal {
    background: rgba(20, 146, 52, 0.12);
    color: #197a31;
  }

  .manager-badge.is-rfi {
    background: rgba(29, 95, 184, 0.12);
    color: #1d4f95;
  }

  .project-access-actions form {
    display: inline-flex;
    margin: 0;
    padding: 0;
  }

  .chip-icon {
    display: inline-flex;
    width: 1.35rem;
    height: 1.35rem;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 999px;
    background: transparent;
    color: #4f594f;
    cursor: pointer;
  }

  .chip-icon:hover {
    background: #ffffff;
    color: #1d5fb8;
  }

  .chip-icon.is-danger:hover {
    background: #fff1f0;
    color: #b42318;
  }

  .membership-edit {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: minmax(8rem, 12rem) auto auto auto;
    gap: 0.4rem;
    align-items: center;
    padding: 0.45rem 0.55rem;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.45rem;
    background: #fff;
    box-shadow: 0 6px 18px -10px rgba(0, 0, 0, 0.18);
  }
  .membership-edit .me-field {
    display: grid;
    gap: 0.18rem;
    min-width: 0;
  }
  .membership-edit .me-field span {
    color: #4f594f;
    font-size: 0.66rem;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .membership-edit .me-field .field {
    min-height: 2rem;
    padding-block: 0.4rem;
    font-size: 0.78rem;
  }
  .membership-edit .me-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .membership-edit {
      grid-template-columns: 1fr 1fr;
    }
    .membership-edit .me-actions {
      grid-column: 1 / -1;
    }
  }

  .empty-projects {
    color: #667066;
    font-size: 0.78rem;
    font-weight: 750;
  }

  .user-card-actions {
    display: grid;
    gap: 0.55rem;
  }

  .assign-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 8rem auto auto;
    gap: 0.45rem;
    align-items: center;
  }

  .assign-form .field {
    min-height: 2.25rem;
    border-radius: 0.35rem;
    padding-block: 0.45rem;
    font-size: 0.78rem;
  }

  .mini-check {
    color: #59615a;
    font-size: 0.74rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .email-button {
    min-height: 2rem;
    padding-inline: 0;
    color: #2f3630;
    font-size: 0.78rem;
  }

  .danger-text {
    color: #b42318;
  }

  .delete-user-form {
    display: grid;
    gap: 0.45rem;
    border: 1px solid #fecaca;
    border-radius: 0.45rem;
    background: #fff1f2;
    padding: 0.7rem;
  }

  .delete-user-form div {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.45rem;
  }

  @media (max-width: 1180px) {
    .invite-grid,
    .user-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 780px) {
    .admin-heading,
    .invite-panel-title,
    .invite-actions,
    .invite-link-panel,
    .user-card-head {
      align-items: stretch;
      flex-direction: column;
    }

    .invite-grid,
    .user-grid,
    .user-access-meta,
    .project-access-row,
    .assign-form,
    .delete-user-form div {
      grid-template-columns: 1fr;
    }

    .field-block.wide {
      grid-column: auto;
    }

    .access-summary {
      justify-items: start;
    }

    .access-detail {
      text-align: left;
    }

    .project-access-badges,
    .project-access-actions {
      flex-wrap: wrap;
    }
  }
</style>
