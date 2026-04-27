<script lang="ts">
  import { Mail, Search, UserRound } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { initialsFor } from '$lib/utils';

  let { data } = $props();
  let query = $state('');
  const filtered = $derived(data.directory.filter((person) => `${person.name} ${person.organization} ${person.role}`.toLowerCase().includes(query.toLowerCase())));
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
    <div class="flex w-full items-center gap-2 rounded-lg border border-black/8 bg-white px-3 py-2 sm:w-auto sm:min-w-72">
      <Search size={16} class="text-pe-sub" />
      <input bind:value={query} class="w-full bg-transparent text-sm outline-none" placeholder="Search people" />
    </div>
  </div>

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
        </div>
      </article>
    {/each}
  </section>
</PageShell>
