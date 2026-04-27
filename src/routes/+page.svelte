<script lang="ts">
  import { AlertCircle, CheckSquare2, MapPin, Plus, Users } from '@lucide/svelte';
  import AppHeader from '$lib/components/AppHeader.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data } = $props();
</script>

<svelte:head>
  <title>Projects | Pueblo Electric Project Portal</title>
</svelte:head>

<AppHeader me={data.me} />

<PageShell>
  <div class="mb-8 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Pueblo Electric</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Your projects</h1>
      <p class="mt-2 max-w-2xl text-sm leading-6 text-pe-sub">Project files, submittals, RFIs, updates, and team conversations.</p>
    </div>
    {#if data.me?.isSuperadmin}
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
    <section class="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {#each data.projects as project}
        <a class="glass lift block rounded-xl p-5" href={`/projects/${project.id}`}>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-xs font-black uppercase tracking-[0.14em] text-pe-sub">{project.number}</p>
              <h2 class="mt-2 line-clamp-2 text-lg font-black text-pe-body">{project.title}</h2>
            </div>
            <StatusPill label={project.status} />
          </div>

          <div class="mt-4 flex items-start gap-2 text-sm text-pe-sub">
            <MapPin size={16} class="mt-0.5 shrink-0" />
            <div>
              <div>{project.address}</div>
              <div class="text-xs">{project.owner}</div>
            </div>
          </div>

          <div class="mt-5">
            <div class="mb-2 flex items-center justify-between text-xs font-bold uppercase tracking-[0.08em] text-pe-sub">
              <span>Complete</span>
              <span class="text-pe-body">{project.completionPercent}%</span>
            </div>
            <div class="h-2 overflow-hidden rounded-full bg-black/8">
              <div class="h-full rounded-full bg-pe-green transition-all" style={`width: ${project.completionPercent}%`}></div>
            </div>
          </div>

          <div class="mt-4 text-sm text-pe-sub">
            <span class="font-bold text-pe-body">Next:</span>
            {project.nextMilestone || 'Milestone not set'}
            {#if project.nextMilestoneDate}
              <span> &middot; {formatDate(project.nextMilestoneDate)}</span>
            {/if}
          </div>

          <div class="mt-5 grid grid-cols-3 gap-2 border-t border-black/8 pt-4 text-xs font-bold text-pe-sub">
            <span class="flex items-center gap-1"><CheckSquare2 size={14} /> {project.openSubmittals}</span>
            <span class="flex items-center gap-1"><AlertCircle size={14} /> {project.openRfis}</span>
            <span class="flex items-center gap-1"><Users size={14} /> {project.actionItems}</span>
          </div>
        </a>
      {/each}
    </section>
  {/if}
</PageShell>
