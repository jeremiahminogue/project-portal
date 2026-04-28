<script lang="ts">
  import { CalendarDays, FileText, FolderOpen, MessageSquare, Users } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate, relativeTime } from '$lib/utils';

  let { data } = $props();
  const project = $derived(data.project);
  const openSubmittals = $derived(data.submittals.filter((item) => !['Approved', 'Rejected'].includes(item.status)));
  const openRfis = $derived(data.rfis.filter((item) => item.status === 'Open'));
  const nextActivities = $derived(data.schedule.slice(0, 5));
</script>

<svelte:head>
  <title>{project.title} | Pueblo Electric Project Portal</title>
</svelte:head>

<PageShell>
  <section class="mb-6 grid gap-5 lg:grid-cols-[1fr_360px]">
    <div class="glass rounded-xl p-6">
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">{project.number}</p>
      <h1 class="mt-2 max-w-4xl text-3xl font-black leading-tight text-pe-body">{project.title}</h1>
      <p class="mt-3 text-sm leading-6 text-pe-sub">{project.address} &middot; {project.owner}</p>
      <div class="mt-5 flex flex-wrap items-center gap-3">
        <StatusPill label={project.status} />
        <span class="rounded-full bg-black/5 px-3 py-1 text-xs font-bold text-pe-sub">Target {formatDate(project.targetComplete || project.nextMilestoneDate)}</span>
      </div>
      <div class="mt-6">
        <div class="mb-2 flex justify-between text-xs font-bold uppercase tracking-[0.08em] text-pe-sub">
          <span>Project completion</span>
          <span>{project.completionPercent}%</span>
        </div>
        <div class="h-2.5 overflow-hidden rounded-full bg-black/8">
          <div class="h-full rounded-full bg-pe-green" style={`width:${project.completionPercent}%`}></div>
        </div>
      </div>
    </div>

    <div class="panel rounded-xl p-5">
      <h2 class="text-base font-black text-pe-body">Next milestone</h2>
      <p class="mt-2 text-xl font-black text-pe-body">{project.nextMilestone || 'Not set'}</p>
      <p class="mt-2 text-sm text-pe-sub">{formatDate(project.nextMilestoneDate, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
      <a class="btn btn-secondary mt-5 w-full" href={`/projects/${data.slug}/schedule`}>
        <CalendarDays size={16} />
        View schedule
      </a>
    </div>
  </section>

  <section class="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <a class="panel lift rounded-xl p-5" href={`/projects/${data.slug}/submittals`}>
      <FileText class="text-pe-green" size={24} />
      <div class="mt-4 text-3xl font-black text-pe-body">{openSubmittals.length}</div>
      <div class="text-sm font-bold text-pe-sub">Open submittals</div>
    </a>
    <a class="panel lift rounded-xl p-5" href={`/projects/${data.slug}/rfis`}>
      <MessageSquare class="text-pe-green" size={24} />
      <div class="mt-4 text-3xl font-black text-pe-body">{openRfis.length}</div>
      <div class="text-sm font-bold text-pe-sub">Open RFIs</div>
    </a>
    <a class="panel lift rounded-xl p-5" href={`/projects/${data.slug}/files`}>
      <FolderOpen class="text-pe-green" size={24} />
      <div class="mt-4 text-3xl font-black text-pe-body">{data.files.length}</div>
      <div class="text-sm font-bold text-pe-sub">Drawings, specs & docs</div>
    </a>
    <a class="panel lift rounded-xl p-5" href={`/projects/${data.slug}/directory`}>
      <Users class="text-pe-green" size={24} />
      <div class="mt-4 text-3xl font-black text-pe-body">{data.directory.length}</div>
      <div class="text-sm font-bold text-pe-sub">Team members</div>
    </a>
  </section>

  <section class="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
    <div class="panel rounded-xl p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-black text-pe-body">Upcoming work</h2>
        <a class="text-sm font-bold text-pe-green-dark" href={`/projects/${data.slug}/schedule`}>Schedule</a>
      </div>
      <div class="space-y-3">
        {#each nextActivities as item}
          <div class="flex items-center justify-between gap-3 rounded-lg border border-black/8 bg-white/72 p-3">
            <div>
              <div class="text-sm font-black text-pe-body">{item.title}</div>
              <div class="text-xs text-pe-sub">{item.phase} &middot; {item.owner}</div>
            </div>
            <div class="text-right text-xs font-bold text-pe-sub">{formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
          </div>
        {/each}
      </div>
    </div>

    <div class="panel rounded-xl p-5">
      <div class="mb-4 flex items-center justify-between">
        <h2 class="text-base font-black text-pe-body">Latest updates</h2>
        <a class="text-sm font-bold text-pe-green-dark" href={`/projects/${data.slug}/updates`}>Updates</a>
      </div>
      <div class="space-y-3">
        {#each data.updates.slice(0, 4) as update}
          <article class="rounded-lg border border-black/8 bg-white/72 p-3">
            <div class="mb-1 flex items-center justify-between gap-3">
              <h3 class="text-sm font-black text-pe-body">{update.title}</h3>
              <span class="text-xs font-bold text-pe-sub">{relativeTime(update.postedDate)}</span>
            </div>
            <p class="line-clamp-2 text-sm leading-6 text-pe-sub">{update.body}</p>
          </article>
        {/each}
      </div>
    </div>
  </section>
</PageShell>
