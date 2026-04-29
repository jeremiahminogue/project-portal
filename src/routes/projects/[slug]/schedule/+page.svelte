<script lang="ts">
  import { enhance } from '$app/forms';
  import { CalendarDays, FileUp, Plus, Trash2 } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { formatDate } from '$lib/utils';

  let { data, form } = $props();
  let showForm = $state(false);
  let showImport = $state(false);
  let editingId = $state('');
  let viewMode = $state<'full' | '2' | '3' | '4'>('full');
  const viewTabs: Array<{ value: 'full' | '2' | '3' | '4'; label: string }> = [
    { value: 'full', label: 'Full' },
    { value: '2', label: '2 week' },
    { value: '3', label: '3 week' },
    { value: '4', label: '4 week' }
  ];

  const dayMs = 24 * 60 * 60 * 1000;
  const editing = $derived(data.schedule.find((item) => item.id === editingId));
  const predecessorMap = $derived(new Map(data.schedule.map((item) => [item.id, item.title])));
  const visibleSchedule = $derived(filterSchedule(data.schedule, viewMode));
  const timelineStart = $derived(timelineEdge(visibleSchedule, 'start'));
  const timelineEnd = $derived(timelineEdge(visibleSchedule, 'end'));
  const timelineDays = $derived(Math.max(1, daysBetween(timelineStart, timelineEnd) + 1));
  const ticks = $derived(timelineTicks(timelineStart, timelineEnd, viewMode));
  const todayPct = $derived.by(() => {
    const offset = daysBetween(timelineStart, data.todayIso);
    const span = daysBetween(timelineStart, timelineEnd);
    if (offset < 0 || offset > span) return null;
    return (offset / timelineDays) * 100;
  });
  const ganttStyle = $derived(
    `--grid-step:${100 / timelineDays}%;` +
    (todayPct !== null
      ? `--today-pct:${todayPct}%;--today-display:block;`
      : '--today-display:none;')
  );
  const activeCount = $derived(data.schedule.filter((item) => overlaps(item, data.todayIso, addDays(data.todayIso, 14))).length);
  const completedCount = $derived(data.schedule.filter((item) => (item.percentComplete ?? 0) >= 100).length);

  function parseIso(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  }

  function addDays(value: string, days: number) {
    return new Date(parseIso(value) + days * dayMs).toISOString().slice(0, 10);
  }

  function daysBetween(start: string, end: string) {
    return Math.round((parseIso(end) - parseIso(start)) / dayMs);
  }

  function overlaps(item: { startDate: string; endDate: string }, start: string, end: string) {
    return parseIso(item.endDate) >= parseIso(start) && parseIso(item.startDate) <= parseIso(end);
  }

  function filterSchedule(schedule: typeof data.schedule, mode: 'full' | '2' | '3' | '4') {
    if (mode === 'full') return schedule;
    const end = addDays(data.todayIso, Number(mode) * 7);
    return schedule.filter((item) => overlaps(item, data.todayIso, end));
  }

  function timelineEdge(schedule: typeof data.schedule, edge: 'start' | 'end') {
    const fallback = edge === 'start' ? data.todayIso : addDays(data.todayIso, 14);
    if (!schedule.length) return fallback;
    return schedule.reduce((selected, item) => {
      const value = edge === 'start' ? item.startDate : item.endDate;
      return edge === 'start'
        ? parseIso(value) < parseIso(selected)
          ? value
          : selected
        : parseIso(value) > parseIso(selected)
          ? value
          : selected;
    }, edge === 'start' ? schedule[0].startDate : schedule[0].endDate);
  }

  function timelineTicks(start: string, end: string, mode: 'full' | '2' | '3' | '4') {
    const span = Math.max(1, daysBetween(start, end));
    const total = span + 1;
    let stepDays: number;
    if (mode === '2') stepDays = 2;
    else if (mode === '3') stepDays = 3;
    else if (mode === '4') stepDays = 4;
    else stepDays = Math.max(1, Math.ceil(span / 7));
    const out: Array<{ iso: string; pct: number }> = [];
    for (let d = 0; d <= span; d += stepDays) {
      out.push({ iso: addDays(start, d), pct: (d / total) * 100 });
    }
    if (out[out.length - 1]?.iso !== end) {
      out.push({ iso: end, pct: (span / total) * 100 });
    }
    return out;
  }

  function barLeft(item: { startDate: string }) {
    return Math.max(0, (daysBetween(timelineStart, item.startDate) / timelineDays) * 100);
  }

  function barWidth(item: { startDate: string; endDate: string }) {
    return Math.max(0.8, ((daysBetween(item.startDate, item.endDate) + 1) / timelineDays) * 100);
  }

  function barColor(item: { type: string; isBlackout: boolean }) {
    if (item.isBlackout) return '#b42318';
    if (item.type === 'bcer') return '#6d5bd0';
    if (item.type === 'ahj') return '#2563eb';
    if (item.type === 'field') return '#c46a1b';
    if (item.type === 'milestone') return '#475569';
    return '#149234';
  }

  function rowLevel(item: { sourceWbs?: string | null }) {
    return Math.min(5, item.sourceWbs ? item.sourceWbs.split('.').length : 1);
  }

  function predecessorLabel(item: { predecessorRefs?: string | null; predecessorId?: string | null }) {
    return item.predecessorRefs || (item.predecessorId ? predecessorMap.get(item.predecessorId) : '') || '-';
  }

  function durationLabel(item: { startDate: string; endDate: string }) {
    const days = daysBetween(item.startDate, item.endDate) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  }
</script>

<svelte:head>
  <title>Schedule | {data.project?.title}</title>
</svelte:head>

<PageShell wide>
  <section class="schedule-hero">
    <div>
      <p class="eyebrow">{data.project?.title}</p>
      <h1>Schedule</h1>
      <p>Imported project plan, Gantt timeline, predecessor references, and clean look-ahead windows.</p>
    </div>
    <div class="schedule-actions">
      {#if data.scheduleAccess?.canManage}
        <button class="btn btn-secondary" type="button" onclick={() => (showImport = !showImport)}>
          <FileUp size={16} />
          Import schedule
        </button>
        <button class="btn btn-primary" type="button" onclick={() => { showForm = !showForm; editingId = ''; }}>
          <Plus size={16} />
          Activity
        </button>
      {/if}
    </div>
  </section>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}
  {#if form?.imported}<div class="mb-4 rounded-lg border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">Imported {form.imported} schedule activities.</div>{/if}

  {#if showImport && data.scheduleAccess?.canManage}
    <form class="import-panel" method="post" enctype="multipart/form-data" action="?/importSchedule" use:enhance>
      <div>
        <span class="eyebrow">MS Project import</span>
        <h2>Upload PDF, XML, or CSV</h2>
        <p>PDF exports from Microsoft Project are parsed from the task table. XML and CSV exports can also carry predecessor references.</p>
      </div>
      <input class="field" name="scheduleFile" type="file" accept=".pdf,.xml,.csv,text/csv,application/pdf,text/xml,application/xml" required />
      <label class="replace-check">
        <input name="replaceSchedule" type="checkbox" checked={data.scheduleAccess?.canDelete ?? false} disabled={!data.scheduleAccess?.canDelete} />
        Replace current schedule
      </label>
      <button class="btn btn-primary" type="submit"><FileUp size={16} />Import</button>
    </form>
  {/if}

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
        <label class="label" for="activity-predecessor">Predecessors</label>
        <input id="activity-predecessor" class="field" name="predecessorRefs" value={editing?.predecessorRefs ?? ''} />
      </div>
      <div>
        <label class="label" for="activity-progress">Progress</label>
        <input id="activity-progress" class="field" name="percentComplete" type="number" min="0" max="100" value={editing?.percentComplete ?? 0} />
      </div>
      <label class="blackout-check">
        <input name="isBlackout" type="checkbox" checked={editing?.isBlackout ?? false} />
        Blackout
      </label>
      <input type="hidden" name="status" value={editing?.status ?? 'blue'} />
      <button class="btn btn-primary" type="submit">{editing ? 'Save activity' : 'Add activity'}</button>
    </form>
  {/if}

  <section class="schedule-stats">
    <div><span>Total activities</span><strong>{data.schedule.length}</strong></div>
    <div><span>Next 2 weeks</span><strong>{activeCount}</strong></div>
    <div><span>Completed</span><strong>{completedCount}</strong></div>
    <div><span>Schedule span</span><strong>{formatDate(timelineStart)} - {formatDate(timelineEnd)}</strong></div>
  </section>

  <section class="schedule-shell">
    <div class="schedule-toolbar">
      <div>
        <span class="eyebrow">Gantt</span>
        <h2>{viewMode === 'full' ? 'Full schedule' : `${viewMode}-week look ahead`}</h2>
      </div>
      <div class="view-tabs" aria-label="Schedule range">
        {#each viewTabs as tab}
          <button type="button" class:active={viewMode === tab.value} onclick={() => (viewMode = tab.value)}>{tab.label}</button>
        {/each}
      </div>
    </div>

    <div class="gantt" style={ganttStyle}>
      <div class="gantt-head">
        <div class="head-label">Activity</div>
        <div class="gantt-axis">
          {#each ticks as tick}
            <span class="tick" style={`left:${tick.pct}%`}>
              <em>{formatDate(tick.iso, { month: 'short' })}</em>
              <strong>{formatDate(tick.iso, { day: 'numeric' })}</strong>
            </span>
          {/each}
          {#if todayPct !== null}
            <span class="today-pin" style={`left:${todayPct}%`}>Today</span>
          {/if}
        </div>
      </div>

      {#each visibleSchedule as item}
        <div class="gantt-row">
          <div class="task-cell" style={`--level:${rowLevel(item) - 1}`}>
            <span class="wbs">{item.sourceWbs ?? item.sourceOrder ?? ''}</span>
            <div class="task-meta">
              <strong>{item.title}</strong>
              <small>{formatDate(item.startDate)} - {formatDate(item.endDate)} · {durationLabel(item)}</small>
            </div>
          </div>
          <div class="bar-cell">
            <div
              class="bar"
              title={`${item.title} (${formatDate(item.startDate)} - ${formatDate(item.endDate)})`}
              style={`--left:${barLeft(item)}%;--width:${barWidth(item)}%;--color:${barColor(item)};`}
            ></div>
          </div>
        </div>
      {:else}
        <div class="empty-schedule">No activities fall inside this look-ahead window.</div>
      {/each}
    </div>
  </section>

  <section class="schedule-table">
    <div class="schedule-toolbar">
      <div>
        <span class="eyebrow">Dates and logic</span>
        <h2>Activity detail</h2>
      </div>
    </div>
    <div class="table-shell">
      <table class="portal-table">
        <thead><tr><th>ID</th><th>Activity</th><th>Start</th><th>Finish</th><th>Predecessors</th><th></th></tr></thead>
        <tbody>
          {#each visibleSchedule as item}
            <tr>
              <td>{item.sourceWbs ?? item.sourceOrder ?? '-'}</td>
              <td><strong>{item.title}</strong><br /><span class="text-pe-sub">{item.phase}</span></td>
              <td>{formatDate(item.startDate)}</td>
              <td>{formatDate(item.endDate)}</td>
              <td>{predecessorLabel(item)}</td>
              <td>
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
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</PageShell>

<style>
  .schedule-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.25rem;
  }

  .schedule-hero h1,
  .schedule-toolbar h2,
  .import-panel h2 {
    margin: 0.15rem 0 0;
    color: #191b19;
    font-size: clamp(1.35rem, 2.2vw, 2.2rem);
    font-weight: 900;
  }

  .schedule-hero p,
  .import-panel p {
    margin-top: 0.35rem;
    max-width: 58rem;
    color: #667067;
    font-size: 0.92rem;
    line-height: 1.55;
  }

  .schedule-actions,
  .row-actions {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.45rem;
  }

  .import-panel {
    display: grid;
    grid-template-columns: minmax(18rem, 1fr) minmax(15rem, 24rem) auto auto;
    gap: 1rem;
    align-items: end;
    margin-bottom: 1.25rem;
    padding: 1rem;
    border: 1px solid rgba(31, 35, 32, 0.1);
    border-radius: 0.75rem;
    background: #fff;
  }

  .replace-check,
  .blackout-check {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    min-height: 2.65rem;
    color: #303630;
    font-size: 0.82rem;
    font-weight: 800;
  }

  .schedule-form {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(4, minmax(0, 1fr)) auto;
    align-items: end;
  }

  .schedule-form > :first-child {
    grid-column: span 2;
  }

  .schedule-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .schedule-stats > div {
    min-height: 5.1rem;
    padding: 1rem;
    border: 1px solid rgba(31, 35, 32, 0.08);
    border-radius: 0.7rem;
    background: #fff;
  }

  .schedule-stats span {
    display: block;
    color: #6b746c;
    font-size: 0.72rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .schedule-stats strong {
    display: block;
    margin-top: 0.45rem;
    color: #191b19;
    font-size: clamp(1.25rem, 2vw, 1.85rem);
    font-weight: 900;
    line-height: 1.1;
  }

  .schedule-shell,
  .schedule-table {
    margin-bottom: 1.25rem;
    padding: 1rem;
    border: 1px solid rgba(31, 35, 32, 0.1);
    border-radius: 0.8rem;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 16px 46px -38px rgba(0, 0, 0, 0.42);
  }

  .schedule-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .view-tabs {
    display: inline-flex;
    gap: 0.25rem;
    padding: 0.25rem;
    border: 1px solid rgba(31, 35, 32, 0.09);
    border-radius: 0.65rem;
    background: #f5f6f3;
  }

  .view-tabs button {
    min-height: 2rem;
    border-radius: 0.45rem;
    padding: 0 0.75rem;
    color: #596159;
    font-size: 0.8rem;
    font-weight: 800;
  }

  .view-tabs button.active {
    color: #fff;
    background: #191b19;
  }

  .gantt {
    overflow-x: auto;
    border: 1px solid rgba(31, 35, 32, 0.08);
    border-radius: 0.65rem;
    background: #fbfcfa;
  }

  .gantt-head,
  .gantt-row {
    display: grid;
    grid-template-columns: minmax(19rem, 28rem) minmax(42rem, 1fr);
    min-width: 62rem;
  }

  .gantt-head {
    position: sticky;
    top: 0;
    z-index: 2;
    color: #4a524a;
    background: linear-gradient(180deg, #f5f7f2 0%, #eef1eb 100%);
    border-bottom: 1px solid rgba(31, 35, 32, 0.12);
    font-size: 0.7rem;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .head-label {
    padding: 0.55rem 0.85rem;
    border-right: 1px solid rgba(31, 35, 32, 0.08);
  }

  .task-cell,
  .bar-cell {
    border-bottom: 1px solid rgba(31, 35, 32, 0.06);
    padding: 0.4rem 0.85rem;
  }

  .gantt-axis {
    position: relative;
    height: 2.4rem;
  }

  .gantt-axis .tick {
    position: absolute;
    top: 0;
    bottom: 0;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.05rem;
    padding: 0 0.3rem;
    color: #525a52;
    line-height: 1;
    pointer-events: none;
  }

  .gantt-axis .tick em {
    color: #8a928b;
    font-size: 0.6rem;
    font-style: normal;
    font-weight: 850;
    letter-spacing: 0.06em;
  }

  .gantt-axis .tick strong {
    color: #1d211e;
    font-size: 0.85rem;
    font-weight: 900;
    text-transform: none;
    letter-spacing: 0;
  }

  .gantt-axis .today-pin {
    position: absolute;
    top: 0.2rem;
    transform: translateX(-50%);
    padding: 0.1rem 0.45rem;
    border-radius: 999px;
    background: #d1342f;
    color: #fff;
    font-size: 0.62rem;
    font-weight: 900;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    box-shadow: 0 4px 10px -4px rgba(209, 52, 47, 0.55);
    z-index: 1;
  }

  .task-cell {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding-left: calc(0.85rem + var(--level) * 0.85rem);
    background: #fff;
    min-height: 2.6rem;
  }

  .task-cell .wbs {
    flex: 0 0 auto;
    min-width: 2.4rem;
    color: #8a928b;
    font-size: 0.65rem;
    font-weight: 850;
    letter-spacing: 0.02em;
  }

  .task-meta {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    line-height: 1.25;
  }

  .task-meta strong {
    color: #1d211e;
    font-size: 0.86rem;
    font-weight: 900;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-meta small {
    color: #7d847e;
    font-size: 0.7rem;
    font-weight: 650;
  }

  .bar-cell {
    position: relative;
    min-height: 2.6rem;
    background:
      linear-gradient(90deg, rgba(31, 35, 32, 0.06) 1px, transparent 1px) 0 0 / var(--grid-step, 8.333%) 100%,
      #fbfcfa;
  }

  .bar-cell::before {
    content: '';
    display: var(--today-display, none);
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--today-pct, 0);
    width: 0;
    border-left: 2px solid rgba(209, 52, 47, 0.7);
    pointer-events: none;
    z-index: 1;
  }

  .bar {
    position: absolute;
    top: 50%;
    left: var(--left);
    width: var(--width);
    min-width: 0.55rem;
    height: 1.05rem;
    transform: translateY(-50%);
    border-radius: 0.4rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.32) 0%, rgba(255, 255, 255, 0) 48%, rgba(0, 0, 0, 0.18) 100%),
      linear-gradient(90deg,
        color-mix(in srgb, var(--color), #fff 10%) 0%,
        var(--color) 45%,
        color-mix(in srgb, var(--color), #000 18%) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.45),
      inset 0 -1px 0 rgba(0, 0, 0, 0.18),
      0 4px 10px -6px color-mix(in srgb, var(--color), #000 40%);
    z-index: 2;
  }

  .empty-schedule {
    min-width: 62rem;
    padding: 1rem;
    color: #667067;
    font-weight: 750;
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

  @media (max-width: 1000px) {
    .schedule-hero,
    .schedule-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .schedule-actions,
    .view-tabs {
      width: 100%;
      justify-content: stretch;
    }

    .schedule-actions .btn,
    .view-tabs button {
      flex: 1;
    }

    .import-panel,
    .schedule-form,
    .schedule-stats {
      grid-template-columns: 1fr 1fr;
    }

    .import-panel > :first-child,
    .schedule-form > :first-child {
      grid-column: span 2;
    }
  }

  @media (max-width: 640px) {
    .import-panel,
    .schedule-form,
    .schedule-stats {
      grid-template-columns: 1fr;
    }

    .import-panel > :first-child,
    .schedule-form > :first-child {
      grid-column: auto;
    }
  }
</style>
