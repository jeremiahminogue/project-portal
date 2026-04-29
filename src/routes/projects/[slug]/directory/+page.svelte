<script lang="ts">
  import { enhance } from '$app/forms';
  import { Mail, Pencil, Phone, Plus, Search, Trash2, UserRound } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { initialsFor } from '$lib/utils';

  let { data, form } = $props();
  let query = $state('');
  let showContactForm = $state(false);
  let editingId = $state('');
  const filtered = $derived(data.directory.filter((person) => `${person.name} ${person.organization} ${person.role}`.toLowerCase().includes(query.toLowerCase())));
  const editing = $derived(data.directory.find((person) => person.id === editingId && person.contactType === 'external'));

  function contactTypeValue(status?: string) {
    if (status === 'Owner') return 'owner';
    if (status === 'AHJ') return 'ahj';
    if (status === 'Reviewer') return 'reviewer';
    return 'external';
  }
</script>

<svelte:head>
  <title>Directory | {data.project?.title}</title>
</svelte:head>

<PageShell>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">{data.project?.title}</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Directory</h1>
      <p class="mt-2 text-sm leading-6 text-pe-sub">Client, design, AHJ, reviewer, and Pueblo Electric project contacts.</p>
    </div>
    <div class="flex flex-wrap items-center gap-2">
      {#if data.directoryAccess?.canManage}
        <button class="btn btn-primary" type="button" onclick={() => { showContactForm = !showContactForm; editingId = ''; }}>
          <Plus size={16} />
          Contact
        </button>
      {/if}
      <div class="flex w-full items-center gap-2 rounded-lg border border-black/8 bg-white px-3 py-2 sm:w-auto sm:min-w-72">
        <Search size={16} class="text-pe-sub" />
        <input bind:value={query} class="w-full bg-transparent text-sm outline-none" placeholder="Search people" />
      </div>
    </div>
  </div>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}

  {#if showContactForm && data.directoryAccess?.canManage}
    <form class="panel directory-form mb-5 rounded-xl p-5" method="post" action="?/saveContact" use:enhance>
      <input type="hidden" name="id" value={editing?.id ?? ''} />
      <div><label class="label" for="contact-name">Name</label><input id="contact-name" class="field" name="name" value={editing?.name ?? ''} required /></div>
      <div><label class="label" for="contact-role">Role</label><input id="contact-role" class="field" name="role" value={editing?.role ?? ''} /></div>
      <div><label class="label" for="contact-org">Organization</label><input id="contact-org" class="field" name="organization" value={editing?.organization ?? ''} /></div>
      <div><label class="label" for="contact-email">Email</label><input id="contact-email" class="field" name="email" type="email" value={editing?.email ?? ''} /></div>
      <div><label class="label" for="contact-phone">Phone</label><input id="contact-phone" class="field" name="phone" value={editing?.phone ?? ''} /></div>
      <div>
        <label class="label" for="contact-type">Type</label>
        <select id="contact-type" class="field" name="contactType">
          {#each ['external', 'owner', 'ahj', 'reviewer'] as type}
            <option value={type} selected={contactTypeValue(editing?.status) === type}>{type}</option>
          {/each}
        </select>
      </div>
      <button class="btn btn-primary" type="submit">{editing ? 'Save contact' : 'Add contact'}</button>
    </form>
  {/if}

  <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    {#each filtered as person}
      <article class="panel lift rounded-xl p-5">
        <div class="flex items-start gap-3">
          <div class="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-pe-green text-sm font-black text-white">
            {initialsFor({ full_name: person.name, email: person.email ?? null })}
          </div>
          <div class="min-w-0">
            <h2 class="truncate text-base font-black text-pe-body">{person.name}</h2>
            <p class="text-sm text-pe-sub">{person.role}</p>
            <p class="text-sm font-semibold text-pe-body">{person.organization}</p>
          </div>
        </div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill label={person.status} />
          {#if person.email}
            <a class="btn btn-secondary min-h-8 px-2 text-xs" href={`mailto:${person.email}`}>
              <Mail size={14} />
              Email
            </a>
          {:else}
            <span class="inline-flex items-center gap-1 text-xs font-bold text-pe-sub"><UserRound size={14} />Portal user</span>
          {/if}
          {#if person.phone}
            <a class="btn btn-secondary min-h-8 px-2 text-xs" href={`tel:${person.phone}`}>
              <Phone size={14} />
              Call
            </a>
          {/if}
          {#if person.contactType === 'external' && data.directoryAccess?.canManage}
            <button class="btn btn-secondary min-h-8 px-2 text-xs" type="button" onclick={() => { editingId = person.id; showContactForm = true; }}>
              <Pencil size={14} />
              Edit
            </button>
          {/if}
          {#if person.contactType === 'external' && data.directoryAccess?.canDelete}
            <form method="post" action="?/deleteContact" use:enhance onsubmit={(event) => { if (!confirm(`Delete ${person.name}?`)) event.preventDefault(); }}>
              <input type="hidden" name="id" value={person.id} />
              <button class="delete-contact" type="submit" aria-label={`Delete ${person.name}`}><Trash2 size={14} /></button>
            </form>
          {/if}
        </div>
      </article>
    {/each}
  </section>
</PageShell>

<style>
  .directory-form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(3, minmax(0, 1fr)) auto;
    align-items: end;
  }

  .delete-contact {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.35rem;
    color: #9a3412;
  }

  .delete-contact:hover {
    background: #fff1ed;
    color: #b42318;
  }

  @media (max-width: 900px) {
    .directory-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .directory-form {
      grid-template-columns: 1fr;
    }

    .directory-form .btn {
      width: 100%;
    }
  }
</style>
