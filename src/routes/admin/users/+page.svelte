<script lang="ts">
  import { enhance } from '$app/forms';
  import { Copy, Mail, Plus, Send, ShieldCheck, UserPlus, X } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';

  let { data, form } = $props();
  let createOpen = $state(true);

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

  {#if createOpen}
    <form class="invite-panel" method="post" action="?/createUser" use:enhance>
      <div class="invite-panel-title">
        <div>
          <h2>Invite or add user</h2>
          <p>Send an email invite by default. Add a temporary password only when you need password sign-in immediately.</p>
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
        <div class="field-block"><label class="label" for="password">Temporary password</label><input id="password" class="field" name="password" type="text" autocomplete="new-password" placeholder="Optional" /></div>
      </div>

      <div class="invite-actions">
        <div class="invite-note">
          <ShieldCheck size={16} />
          Users can receive an invite/magic link by email, or sign in with the temporary password if one is set.
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
        <article class="user-card">
          <div class="user-card-head">
            <div class="min-w-0">
              <h3>{user.fullName ?? user.email}</h3>
              <a href={`mailto:${user.email}`}>{user.email}</a>
              <p>{user.company ?? 'No company'} {user.title ? `- ${user.title}` : ''}</p>
            </div>
            <div class="user-status">
              <StatusPill label={user.emailConfirmed ? 'Confirmed' : 'Pending'} />
              <StatusPill label={user.isSuperadmin ? 'Superadmin' : 'User'} />
            </div>
          </div>

          <div class="project-chip-list">
            {#each user.projects as project}
              <form class="project-chip" method="post" action="?/removeProject" use:enhance>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="projectId" value={project.id} />
                <span>#{project.slug} - {project.role}</span>
                <button type="submit" aria-label={`Remove ${user.email} from ${project.name}`}>
                  <X size={13} />
                </button>
              </form>
            {:else}
              <span class="empty-projects">No projects assigned</span>
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
          </div>
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

  .user-status {
    display: flex;
    flex-direction: column;
    align-items: end;
    gap: 0.3rem;
  }

  .project-chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .project-chip {
    display: inline-flex;
    max-width: 100%;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 999px;
    background: #f6f7f5;
    padding: 0.26rem 0.32rem 0.26rem 0.55rem;
    color: #252a25;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .project-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-chip button {
    display: grid;
    width: 1.35rem;
    height: 1.35rem;
    place-items: center;
    border-radius: 999px;
    color: #667066;
  }

  .project-chip button:hover {
    background: #fff1f0;
    color: #b42318;
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
    .assign-form {
      grid-template-columns: 1fr;
    }

    .field-block.wide {
      grid-column: auto;
    }

    .user-status {
      align-items: start;
      flex-direction: row;
      flex-wrap: wrap;
    }
  }
</style>
