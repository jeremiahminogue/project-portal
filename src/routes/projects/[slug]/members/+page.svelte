<!--
  Project members admin.

  Lets project admins (and superadmins) manage their own roster: change
  role, flip submittal-manager / RFI-manager flags, and remove members
  without leaving the project. Members the gates in
    - server: requireProjectAccess({ roles: ['superadmin', 'admin'] })
    - update/remove actions write through the user's supabase client; RLS
      policies (migrations 0003 + 0017) enforce project-admin scope.
  This is the partner UI to /admin/users which only superadmins can reach;
  this surface is the project-scoped equivalent.
-->
<script lang="ts">
  import { enhance } from '$app/forms';
  import { Pencil, Save, ShieldCheck, Trash2, Users, X } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import type { SubmitFunction } from '@sveltejs/kit';

  let { data, form } = $props();

  let editingUserId = $state('');
  let removingUserId = $state('');

  function startEdit(userId: string) {
    editingUserId = editingUserId === userId ? '' : userId;
    removingUserId = '';
  }

  function startRemove(userId: string) {
    removingUserId = removingUserId === userId ? '' : userId;
    editingUserId = '';
  }

  const closeOnSuccess: SubmitFunction = () => async ({ result, update }) => {
    await update();
    if (result.type === 'success') {
      editingUserId = '';
      removingUserId = '';
    }
  };

  function roleLabel(role: string) {
    if (role === 'admin') return 'Admin';
    if (role === 'member') return 'Member';
    if (role === 'guest') return 'Guest';
    if (role === 'readonly') return 'Read-only';
    return role;
  }
</script>

<svelte:head>
  <title>Members | {data.project?.title ?? 'Project'}</title>
</svelte:head>

<PageShell wide>
  <div class="members-heading">
    <div>
      <span class="eyebrow">Project</span>
      <h1>Members</h1>
      <p>
        Project admins and superadmins can change roles, mark submittal / RFI managers, and remove people from this project.
        Manager flags drive who reviews unrouted submittals and RFIs.
      </p>
    </div>
    <a class="btn btn-secondary" href={`/projects/${data.project?.id ?? ''}/directory`}>
      <Users size={16} />Directory
    </a>
  </div>

  {#if form?.error}
    <div class="banner-error">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="banner-ok">{form.message ?? 'Saved.'}</div>
  {/if}
  {#if data.accessError}
    <div class="banner-error">{data.accessError}</div>
  {/if}

  {#if !data.canManage}
    <div class="readonly-banner">
      <ShieldCheck size={14} />
      <span>You are viewing the member list. Only a project admin or a superadmin can change roles or manager flags.</span>
    </div>
  {/if}

  <section class="members-shell">
    <header class="members-toolbar">
      <h2>Roster</h2>
      <span class="count">{data.members.length} member{data.members.length === 1 ? '' : 's'}</span>
    </header>

    {#if data.members.length === 0}
      <div class="empty">
        <strong>No members yet.</strong>
        <span>Invite portal users from <a href="/admin/users">Admin · Users</a>.</span>
      </div>
    {:else}
      <ul class="member-list">
        {#each data.members as member}
          <li class="member-row" class:is-self={member.userId === data.currentUserId}>
            <div class="member-main">
              <div class="member-id">
                <strong>{member.fullName}</strong>
                {#if member.email}<a href={`mailto:${member.email}`}>{member.email}</a>{/if}
              </div>
              <div class="member-meta">
                {#if member.company}<span>{member.company}</span>{/if}
                {#if member.title}<span>{member.title}</span>{/if}
              </div>
            </div>

            <div class="member-flags">
              <StatusPill label={roleLabel(member.role)} />
              {#if member.isSubmittalManager}
                <span class="flag is-submittal" title="Receives unrouted submittals">SM</span>
              {/if}
              {#if member.isRfiManager}
                <span class="flag is-rfi" title="Receives unrouted RFIs">RM</span>
              {/if}
            </div>

            {#if data.canManage}
              <div class="member-actions">
                <button class="row-icon-btn" type="button" title="Edit role + flags" aria-label={`Edit ${member.fullName}`} onclick={() => startEdit(member.userId)}>
                  <Pencil size={14} />
                </button>
                <button class="row-icon-btn is-danger" type="button" title="Remove from project" aria-label={`Remove ${member.fullName}`} onclick={() => startRemove(member.userId)}>
                  <Trash2 size={14} />
                </button>
              </div>
            {/if}

            {#if data.canManage && editingUserId === member.userId}
              <form
                class="member-edit"
                method="post"
                action="?/updateMember"
                use:enhance={closeOnSuccess}
              >
                <input type="hidden" name="userId" value={member.userId} />
                <label class="me-field">
                  <span>Role</span>
                  <select class="field" name="role">
                    <option value="admin" selected={member.role === 'admin'}>Admin</option>
                    <option value="member" selected={member.role === 'member'}>Member</option>
                    <option value="guest" selected={member.role === 'guest'}>Guest</option>
                    <option value="readonly" selected={member.role === 'readonly'}>Read-only</option>
                  </select>
                </label>
                <label class="me-check">
                  <input type="checkbox" name="isSubmittalManager" checked={member.isSubmittalManager} />
                  <span>Submittal manager</span>
                  <small>Picks up submittals that arrive without a routing chain.</small>
                </label>
                <label class="me-check">
                  <input type="checkbox" name="isRfiManager" checked={member.isRfiManager} />
                  <span>RFI manager</span>
                  <small>Picks up RFIs that arrive without a designated reviewer.</small>
                </label>
                <div class="me-actions">
                  <button class="btn btn-ghost" type="button" onclick={() => (editingUserId = '')}>Cancel</button>
                  <button class="btn btn-primary" type="submit">
                    <Save size={14} />Save
                  </button>
                </div>
              </form>
            {/if}

            {#if data.canManage && removingUserId === member.userId}
              <form
                class="member-remove"
                method="post"
                action="?/removeMember"
                use:enhance={closeOnSuccess}
              >
                <input type="hidden" name="userId" value={member.userId} />
                <p>Remove <strong>{member.fullName}</strong> from this project? Their portal account stays intact - they just lose project access.</p>
                <div class="me-actions">
                  <button class="btn btn-ghost" type="button" onclick={() => (removingUserId = '')}>Cancel</button>
                  <button class="btn btn-danger" type="submit">
                    <Trash2 size={14} />Remove
                  </button>
                </div>
              </form>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</PageShell>

<style>
  .members-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .members-heading .eyebrow {
    color: #4f594f;
    font-size: 0.7rem;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .members-heading h1 {
    margin: 0.2rem 0 0.3rem;
    color: #191b19;
    font-size: 1.55rem;
    font-weight: 900;
  }
  .members-heading p {
    margin: 0;
    color: #4f594f;
    font-size: 0.85rem;
    line-height: 1.4;
    max-width: 60ch;
  }

  .banner-error,
  .banner-ok,
  .readonly-banner {
    margin-bottom: 0.7rem;
    padding: 0.55rem 0.7rem;
    border-radius: 0.4rem;
    font-size: 0.82rem;
    font-weight: 800;
    line-height: 1.4;
  }
  .banner-error { background: #fdecec; color: #9b1c1c; border: 1px solid #f4c0c0; }
  .banner-ok { background: rgba(29, 175, 63, 0.1); color: #197a31; border: 1px solid rgba(29, 175, 63, 0.22); }
  .readonly-banner {
    display: inline-flex; align-items: center; gap: 0.45rem;
    background: rgba(29, 95, 184, 0.06);
    color: #1d4f95;
    border: 1px solid rgba(29, 95, 184, 0.2);
  }

  .members-shell {
    border: 1px solid rgba(25, 27, 25, 0.08);
    border-radius: 0.55rem;
    background: #fff;
    overflow: hidden;
  }
  .members-toolbar {
    display: flex; align-items: center; justify-content: space-between;
    gap: 0.7rem;
    padding: 0.7rem 0.95rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.06);
    background: #fafbf8;
  }
  .members-toolbar h2 { margin: 0; color: #191b19; font-size: 0.95rem; font-weight: 850; }
  .members-toolbar .count { color: #4f594f; font-size: 0.78rem; font-weight: 800; }

  .empty {
    padding: 2rem 1rem;
    text-align: center;
    color: #4f594f;
  }
  .empty strong { display: block; color: #191b19; font-size: 1rem; font-weight: 850; margin-bottom: 0.25rem; }
  .empty a { color: #1d5fb8; font-weight: 850; }

  .member-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .member-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.7rem;
    padding: 0.7rem 0.95rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.06);
  }
  .member-row:last-child { border-bottom: 0; }
  .member-row.is-self { background: rgba(29, 175, 63, 0.04); }

  .member-main { min-width: 0; display: grid; gap: 0.18rem; }
  .member-id strong {
    color: #191b19;
    font-size: 0.92rem;
    font-weight: 850;
    overflow-wrap: anywhere;
  }
  .member-id a {
    margin-left: 0.5rem;
    color: #1d5fb8;
    font-size: 0.78rem;
    font-weight: 800;
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  .member-id a:hover { text-decoration: underline; }
  .member-meta {
    display: flex; flex-wrap: wrap; gap: 0.5rem;
    color: #4f594f;
    font-size: 0.74rem;
    font-weight: 750;
  }
  .member-meta span {
    overflow-wrap: anywhere;
  }

  .member-flags {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .flag {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 1.4rem;
    padding: 0 0.55rem;
    border-radius: 999px;
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.05em;
  }
  .flag.is-submittal {
    background: rgba(20, 146, 52, 0.14);
    color: #197a31;
  }
  .flag.is-rfi {
    background: rgba(29, 95, 184, 0.14);
    color: #1d4f95;
  }

  .member-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .row-icon-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2rem; height: 2rem;
    border: 1px solid rgba(25, 27, 25, 0.14); border-radius: 0.4rem;
    background: #fff;
    color: #2c322d;
    cursor: pointer;
    transition: border-color 0.12s, background 0.12s, color 0.12s;
  }
  .row-icon-btn:hover { border-color: rgba(20, 146, 52, 0.45); background: rgba(29, 175, 63, 0.08); color: #197a31; }
  .row-icon-btn.is-danger:hover {
    border-color: rgba(176, 30, 30, 0.5); background: rgba(220, 38, 38, 0.1); color: #9b1c1c;
  }

  .member-edit,
  .member-remove {
    grid-column: 1 / -1;
    display: grid;
    gap: 0.55rem;
    margin-top: 0.6rem;
    padding: 0.85rem;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.45rem;
    background: #f6f7f5;
  }
  .member-edit {
    grid-template-columns: minmax(10rem, 14rem) minmax(0, 1fr);
  }
  .me-field {
    display: grid;
    gap: 0.22rem;
    min-width: 0;
  }
  .me-field span {
    color: #4f594f;
    font-size: 0.7rem;
    font-weight: 850;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }
  .me-field .field {
    min-height: 2.2rem;
    padding-block: 0.4rem;
    font-size: 0.85rem;
  }
  .me-check {
    display: grid;
    grid-template-columns: 1.05rem minmax(0, 1fr);
    column-gap: 0.5rem;
    row-gap: 0.15rem;
    align-items: start;
    color: #1f231f;
    font-size: 0.84rem;
    font-weight: 800;
    line-height: 1.3;
  }
  .me-check input {
    margin-top: 0.18rem;
    width: 1rem;
    height: 1rem;
    accent-color: #197a31;
  }
  .me-check small {
    grid-column: 2;
    color: #59615a;
    font-size: 0.72rem;
    font-weight: 750;
    line-height: 1.35;
  }
  .me-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    grid-column: 1 / -1;
    justify-content: flex-end;
  }

  .member-remove p {
    margin: 0;
    color: #2c322d;
    font-size: 0.85rem;
    line-height: 1.4;
  }

  .btn-danger {
    background: #b42318;
    color: #fff;
    border: 1px solid #b42318;
  }
  .btn-danger:hover { background: #921a12; border-color: #921a12; }

  @media (max-width: 720px) {
    .member-row {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto auto auto;
    }
    .member-flags { justify-content: flex-start; }
    .member-actions { justify-content: flex-start; }
    .member-edit { grid-template-columns: 1fr; }
  }
</style>
