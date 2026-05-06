<script lang="ts">
  import { ArrowRight, Plus } from '@lucide/svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import PageShell from '$lib/components/PageShell.svelte';

  let { data } = $props();
</script>

<svelte:head>
  <title>Projects | Pueblo Electric Project Portal</title>
</svelte:head>

<AppHeader me={data.me} />

<PageShell>
  <div class="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Pueblo Electric</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Your projects</h1>
      <p class="mt-2 text-sm text-pe-sub">Pick a job to open its workspace.</p>
    </div>
    {#if data.canCreateProjects}
      <a class="btn btn-secondary" href="/admin/projects">
        <Plus size={16} />
        New project
      </a>
    {/if}
  </div>

  {#if data.projects.length === 0}
    <section class="panel rounded-xl p-10 text-center">
      <h2 class="text-lg font-black text-pe-body">No projects to show</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-pe-sub">Once Pueblo Electric grants project access, assigned projects will appear here.</p>
    </section>
  {:else}
    <section class="overflow-hidden rounded-xl border border-black/8 bg-white shadow-sm">
      {#each data.projects as project}
        <a
          class="group grid gap-4 border-b border-black/8 px-5 py-5 transition last:border-b-0 hover:bg-pe-green/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-pe-green md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
          href={`/projects/${project.id}`}
        >
          <div class="min-w-0">
            <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span class="text-xs font-black uppercase tracking-[0.14em] text-pe-green-dark">{project.number}</span>
              <h2 class="truncate text-lg font-black text-pe-body">{project.title}</h2>
            </div>
            <div class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-pe-sub">
              <span>{project.owner}</span>
              <span class="hidden text-black/30 sm:inline">/</span>
              <span>{project.address}</span>
            </div>
          </div>
          <div class="flex items-center gap-2 text-sm font-black text-pe-green-dark md:justify-self-end">
            Open
            <ArrowRight size={16} class="transition group-hover:translate-x-0.5" />
          </div>
        </a>
      {/each}
    </section>
  {/if}
</PageShell>
