<script lang="ts">
  import { CalendarDays } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data } = $props();
  const phases = $derived([...new Set(data.schedule.map((item) => item.phase))]);
</script>

<svelte:head>
  <title>Schedule | {data.project?.title}</title>
</svelte:head>

<PageShell>
  <div class="mb-6">
    <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">{data.project?.title}</p>
    <h1 class="mt-2 text-3xl font-black text-pe-body">Schedule</h1>
    <p class="mt-2 text-sm leading-6 text-pe-sub">Milestones, blackout windows, design reviews, and field activities.</p>
  </div>

  <div class="space-y-5">
    {#each phases as phase}
      <section class="panel rounded-xl p-5">
        <h2 class="mb-4 flex items-center gap-2 text-base font-black text-pe-body">
          <CalendarDays size={18} class="text-pe-green" />
          {phase}
        </h2>
        <div class="space-y-3">
          {#each data.schedule.filter((item) => item.phase === phase) as item}
            <div class="grid gap-3 rounded-lg border border-black/8 bg-white/72 p-4 md:grid-cols-[1fr_220px_120px] md:items-center">
              <div>
                <div class="font-black text-pe-body">{item.title}</div>
                <div class="mt-1 text-sm text-pe-sub">{item.owner || 'Owner not set'}</div>
              </div>
              <div class="text-sm font-semibold text-pe-sub">{formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
              <div><StatusPill label={item.isBlackout ? 'Blackout' : item.status} /></div>
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</PageShell>
