<script lang="ts">
  import { enhance } from '$app/forms';
  import { CalendarDays, Plus, Trash2 } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data, form } = $props();
  let showForm = $state(false);
  let editingId = $state('');
  const phases = $derived([...new Set(data.schedule.map((item) => item.phase))]);
  const editing = $derived(data.schedule.find((item) => item.id === editingId));
</script>

<svelte:head>
  <title>Schedule | {data.project?.title}</title>
</svelte:head>

<PageShell>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">{data.project?.title}</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Schedule</h1>
      <p class="mt-2 text-sm leading-6 text-pe-sub">Milestones, blackout windows, design reviews, and field activities.</p>
    </div>
    {#if data.scheduleAccess?.canManage}
      <button class="btn btn-primary" type="button" onclick={() => { showForm = !showForm; editingId = ''; }}>
        <Plus size={16} />
        Activity
      </button>
    {/if}
  </div>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}

  {#if showForm && data.scheduleAccess?.canManage}
    <form class="panel schedule-form mb-5 rounded-xl p-5" method="post" action="?/saveActivity" use:enhance>
      <input type="hidden" name="id" value={editing?.id ?? ''} />
      <div>
        <label class="label" for="activity-title">Title</label>
        <input id="activity-title" class="field" name="title" value={editing?.title ?? ''} required />
      </div>
      <div>
        <label class="label" for="activity-phase">Phase</label>
        <input id="activity-phase" class="field" name="phase" value={editing?.phase ?? ''} placeholder="Events Center" required />
      </div>
      <div>
        <label class="label" for="activity-type">Type</label>
        <select id="activity-type" class="field" name="activityType">
          {#each ['internal', 'design', 'bcer', 'ahj', 'field', 'milestone'] as type}
            <option value={type} selected={(editing?.type ?? 'internal') === type}>{type}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="label" for="activity-start">Start</label>
        <input id="activity-start" class="field" name="startDate" type="date" value={editing?.startDate ?? ''} required />
      </div>
      <div>
        <label class="label" for="activity-end">End</label>
        <input id="activity-end" class="field" name="endDate" type="date" value={editing?.endDate ?? ''} required />
      </div>
      <div>
        <label class="label" for="activity-owner">Owner</label>
        <input id="activity-owner" class="field" name="owner" value={editing?.owner ?? ''} />
      </div>
      <div>
        <label class="label" for="activity-status">Status</label>
        <select id="activity-status" class="field" name="status">
          {#each ['blue', 'green', 'amber', 'red', 'gray', 'purple'] as status}
            <option value={status} selected={(editing?.status ?? 'blue') === status}>{status}</option>
          {/each}
        </select>
      </div>
      <div>
        <label class="label" for="activity-progress">Progress</label>
        <input id="activity-progress" class="field" name="percentComplete" type="number" min="0" max="100" value={editing?.percentComplete ?? 0} />
      </div>
      <label class="blackout-check">
        <input name="isBlackout" type="checkbox" checked={editing?.isBlackout ?? false} />
        Blackout
      </label>
      <button class="btn btn-primary" type="submit">{editing ? 'Save activity' : 'Add activity'}</button>
    </form>
  {/if}

  <div class="space-y-5">
    {#each phases as phase}
      <section class="panel rounded-xl p-5">
        <h2 class="mb-4 flex items-center gap-2 text-base font-black text-pe-body">
          <CalendarDays size={18} class="text-pe-green" />
          {phase}
        </h2>
        <div class="space-y-3">
          {#each data.schedule.filter((item) => item.phase === phase) as item}
            <div class="grid gap-3 rounded-lg border border-black/8 bg-white/72 p-4 md:grid-cols-[1fr_220px_120px_auto] md:items-center">
              <div>
                <div class="font-black text-pe-body">{item.title}</div>
                <div class="mt-1 text-sm text-pe-sub">{item.owner || 'Owner not set'} - {item.type} - {item.percentComplete ?? 0}%</div>
              </div>
              <div class="text-sm font-semibold text-pe-sub">{formatDate(item.startDate)} - {formatDate(item.endDate)}</div>
              <div><StatusPill label={item.isBlackout ? 'Blackout' : item.status} /></div>
              {#if data.scheduleAccess?.canManage}
                <div class="row-actions">
                  <button class="mini-button" type="button" onclick={() => { editingId = item.id; showForm = true; }}>Edit</button>
                  {#if data.scheduleAccess?.canDelete}
                    <form method="post" action="?/deleteActivity" use:enhance onsubmit={(event) => { if (!confirm(`Delete "${item.title}"?`)) event.preventDefault(); }}>
                      <input type="hidden" name="id" value={item.id} />
                      <button class="delete-activity" type="submit" aria-label={`Delete ${item.title}`}><Trash2 size={14} /></button>
                    </form>
                  {/if}
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</PageShell>

<style>
  .schedule-form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    align-items: end;
  }

  .schedule-form > :first-child {
    grid-column: span 2;
  }

  .blackout-check {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.65rem;
    color: #303630;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.35rem;
  }

  .delete-activity {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.35rem;
    color: #9a3412;
  }

  .delete-activity:hover {
    background: #fff1ed;
    color: #b42318;
  }

  @media (max-width: 900px) {
    .schedule-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .schedule-form > :first-child,
    .schedule-form .btn {
      grid-column: span 2;
    }
  }

  @media (max-width: 640px) {
    .schedule-form {
      grid-template-columns: 1fr;
    }

    .schedule-form > :first-child,
    .schedule-form .btn {
      grid-column: auto;
      width: 100%;
    }
  }
</style>
