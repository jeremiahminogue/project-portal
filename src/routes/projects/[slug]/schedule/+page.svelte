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
  const timelineStart = $derived(viewMode === 'full' ? timelineEdge(data.schedule, 'start') : data.todayIso);
  const timelineEnd = $derived(viewMode === 'full' ? timelineEdge(data.schedule, 'end') : addDays(data.todayIso, Number(viewMode) * 7 - 1));
  const timelineDays = $derived(Math.max(1, daysBetween(timelineStart, timelineEnd) + 1));
  const ticks = $derived(timelineTicks(timelineStart, timelineEnd));
  const activeCount = $derived(data.schedule.filter((item) => overlaps(item, data.todayIso, addDays(data.todayIso, 13))).length);
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
    const end = addDays(data.todayIso, Number(mode) * 7 - 1);
    const inWindow = new Set(schedule.filter((item) => overlaps(item, data.todayIso, end)).map((item) => item.id));
    const visibleGroups = new Set(
      schedule
        .filter((item) => inWindow.has(item.id) && item.sourceWbs?.includes('.'))
        .map((item) => item.sourceWbs?.split('.')[0])
        .filter(Boolean)
    );
    return schedule.filter((item) => inWindow.has(item.id) || (isGroupHeader(item) && visibleGroups.has(item.sourceWbs ?? '')));
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

  function timelineTicks(start: string, end: string) {
    const span = Math.max(1, daysBetween(start, end));
    const points = timelineDays <= 14 ? [0, 0.25, 0.5, 0.75, 1] : [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1];
    return points.map((point) => ({
      date: addDays(start, Math.round(span * point)),
      left: point * 100
    }));
  }

  function barLeft(item: { startDate: string }) {
    const start = parseIso(item.startDate) < parseIso(timelineStart) ? timelineStart : item.startDate;
    return Math.max(0, (daysBetween(timelineStart, start) / timelineDays) * 100);
  }

  function barWidth(item: { startDate: string; endDate: string }) {
    const start = parseIso(item.startDate) < parseIso(timelineStart) ? timelineStart : item.startDate;
    const end = parseIso(item.endDate) > parseIso(timelineEnd) ? timelineEnd : item.endDate;
    return Math.max(0.8, ((daysBetween(start, end) + 1) / timelineDays) * 100);
  }

  function barColor(item: { type: string; isBlackout: boolean; percentComplete?: number | null }) {
    if (isComplete(item)) return '#15803d';
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

  function isGroupHeader(item: { sourceWbs?: string | null }) {
    return Boolean(item.sourceWbs && /^\d+$/.test(item.sourceWbs));
  }

  function isComplete(item: { percentComplete?: number | null }) {
    return (item.percentComplete ?? 0) >= 100;
  }

  function predecessorLabel(item: { predecessorRefs?: string | null; predecessorId?: string | null }) {
    return item.predecessorRefs || (item.predecessorId ? predecessorMap.get(item.predecessorId) : '') || '-';
  }

  function durationLabel(item: { startDate: string; endDate: string }) {
    const days = daysBetween(item.startDate, item.endDate) + 1;
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  function rangeLabel() {
    return `${formatDate(timelineStart, { month: 'short', day: 'numeric' })} - ${formatDate(timelineEnd, { month: 'short', day: 'numeric' })}`;
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
      <label class="complete-check">
        <input name="markComplete" type="checkbox" checked={isComplete(editing ?? { percentComplete: 0 })} />
        Mark complete
      </label>
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
        <p class="range-label">{rangeLabel()}</p>
      </div>
      <div class="view-tabs" aria-label="Schedule range">
        {#each viewTabs as tab}
          <button type="button" class:active={viewMode === tab.value} onclick={() => (viewMode = tab.value)}>{tab.label}</button>
        {/each}
      </div>
    </div>

    <div class="gantt">
      <div class="gantt-head">
        <div>Activity</div>
        <div class="gantt-axis">
          {#each ticks as tick}
            <span style={`--left:${tick.left}%;`}>{formatDate(tick.date, { month: 'short', day: 'numeric' })}</span>
          {/each}
        </div>
      </div>

      {#each visibleSchedule as item}
        <div class="gantt-row" class:group-row={isGroupHeader(item)} class:complete-row={isComplete(item)}>
          <div class="task-cell" style={`--level:${rowLevel(item) - 1}`}>
            <span class="task-id">{item.sourceWbs ?? item.sourceOrder ?? ''}</span>
            <strong>{item.title}</strong>
            <small>{formatDate(item.startDate)} - {formatDate(item.endDate)} · {durationLabel(item)}{isComplete(item) ? ' · Complete' : ''}</small>
          </div>
          <div class="bar-cell">
            {#each ticks as tick}
              <span class="grid-line" style={`--left:${tick.left}%;`}></span>
            {/each}
            <div class="bar" style={`--left:${barLeft(item)}%;--width:${barWidth(item)}%;--color:${barColor(item)};`}>
            </div>
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
            <tr class:complete-row={isComplete(item)} class:group-row={isGroupHeader(item)}>
              <td>{item.sourceWbs ?? item.sourceOrder ?? '-'}</td>
              <td><strong>{item.title}</strong><br /><span class="text-pe-sub">{item.phase}</span></td>
              <td>{formatDate(item.startDate)}</td>
              <td>{formatDate(item.endDate)}</td>
              <td>{predecessorLabel(item)}</td>
              <td>
                {#if data.scheduleAccess?.canManage}
                  <div class="row-actions">
                    <button class="mini-button" type="button" title={`Edit ${item.title}`} onclick={() => { editingId = item.id; showForm = true; }}>Edit</button>
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
  .complete-check,
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

  .range-label {
    margin: 0.2rem 0 0;
    color: #596159;
    font-size: 0.82rem;
    font-weight: 800;
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
    grid-template-columns: minmax(24rem, 36rem) minmax(46rem, 1fr);
    min-width: 70rem;
  }

  .gantt-head {
    position: sticky;
    top: 0;
    z-index: 1;
    color: #424a43;
    background: linear-gradient(180deg, #f7f8f5 0%, #eef2ec 100%);
    font-size: 0.76rem;
    font-weight: 900;
    text-transform: uppercase;
  }

  .gantt-head > div,
  .task-cell,
  .bar-cell {
    border-bottom: 1px solid rgba(31, 35, 32, 0.08);
    padding: 0.72rem 0.85rem;
  }

  .gantt-axis {
    position: relative;
    min-height: 2.6rem;
  }

  .gantt-axis span {
    position: absolute;
    left: var(--left);
    top: 50%;
    display: grid;
    min-width: 5rem;
    min-height: 2.1rem;
    place-items: center;
    transform: translate(-50%, -50%);
    border-left: 1px solid rgba(31, 35, 32, 0.14);
    color: #2f3730;
    font-size: 0.78rem;
    font-weight: 950;
  }

  .gantt-axis span:first-child {
    transform: translate(0, -50%);
    place-items: center start;
  }

  .gantt-axis span:last-child {
    transform: translate(-100%, -50%);
    place-items: center end;
  }

  .task-cell {
    display: grid;
    grid-template-columns: minmax(2rem, auto) minmax(8rem, 1fr) auto;
    gap: 0.65rem;
    align-items: center;
    padding-left: calc(0.85rem + var(--level) * 1rem);
    background: #fff;
  }

  .task-id {
    color: #8a928b;
    font-size: 0.72rem;
    font-weight: 900;
  }

  .task-cell strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #1d211e;
    font-size: 0.88rem;
    font-weight: 900;
  }

  .task-cell small {
    color: #687168;
    font-size: 0.72rem;
    font-weight: 750;
    white-space: nowrap;
  }

  .group-row .task-cell,
  .group-row .bar-cell {
    background-color: #f4f7f2;
  }

  .group-row .task-cell {
    border-left: 4px solid #149234;
    padding-left: calc(0.6rem + var(--level) * 1rem);
  }

  .group-row .task-id,
  .group-row .task-cell strong {
    color: #111811;
  }

  .group-row .task-cell strong {
    text-transform: uppercase;
    letter-spacing: 0;
  }

  .group-row .task-cell small {
    color: #3f4a40;
  }

  .complete-row .task-cell,
  .complete-row .bar-cell {
    background:
      linear-gradient(90deg, rgba(20, 146, 52, 0.08), transparent 38%),
      #fbfdfb;
  }

  .complete-row .task-cell strong {
    color: #14532d;
  }

  .complete-row .task-cell small {
    color: #1f7a3d;
  }

  .bar-cell {
    position: relative;
    min-height: 2.65rem;
    background: #fbfcfa;
  }

  .grid-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: var(--left);
    width: 1px;
    background: rgba(31, 35, 32, 0.075);
    transform: translateX(-0.5px);
    pointer-events: none;
  }

  .grid-line:first-child,
  .grid-line:last-child {
    background: rgba(31, 35, 32, 0.14);
  }

  .bar {
    position: absolute;
    top: 50%;
    left: var(--left);
    width: var(--width);
    min-width: 0.55rem;
    height: 1.08rem;
    transform: translateY(-50%);
    border: 1px solid color-mix(in srgb, var(--color), #fff 20%);
    border-radius: 0.32rem;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--color), #fff 28%) 0%, var(--color) 48%, color-mix(in srgb, var(--color), #000 18%) 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.42),
      0 8px 18px -12px color-mix(in srgb, var(--color), #000 46%);
  }

  .group-row .bar {
    opacity: 0.92;
  }

  .complete-row .bar {
    background:
      linear-gradient(180deg, #53d374 0%, #16a34a 48%, #087a32 100%);
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.52),
      0 0 0 3px rgba(34, 197, 94, 0.1),
      0 8px 18px -12px rgba(21, 128, 61, 0.58);
  }

  .complete-row .bar::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(110deg, transparent 0%, rgba(255, 255, 255, 0.28) 42%, transparent 58%);
  }

  .empty-schedule {
    min-width: 70rem;
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
