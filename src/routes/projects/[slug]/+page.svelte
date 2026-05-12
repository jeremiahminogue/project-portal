<script lang="ts">
  import { CalendarDays, FileText, FolderOpen, MessageSquare, Users } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { fileMatchesTool } from '$lib/file-library';
  import { formatDate, relativeTime } from '$lib/utils';

  let { data } = $props();
  const project = $derived(data.project);
  const openSubmittals = $derived(data.submittals.filter((item) => !['Approved', 'Rejected'].includes(item.status)));
  const openRfis = $derived(data.rfis.filter((item) => item.status === 'Open'));
  const nextActivities = $derived(data.schedule.slice(0, 6));
  const drawingCount = $derived(
    data.files
      .filter((file) => fileMatchesTool(file, 'drawings'))
      .reduce((total, file) => total + Math.max(file.pages?.length ?? 0, 1), 0)
  );
</script>

<svelte:head>
  <title>{project.title} | Pueblo Electric Project Portal</title>
</svelte:head>

<PageShell>
  <section class="dashboard-hero">
    <div>
      <p class="eyebrow">{project.number}</p>
      <h1>{project.title}</h1>
      <p>{project.address} · {project.owner}</p>
    </div>
    <a class="btn btn-primary" href={`/projects/${data.slug}/schedule`}>
      <CalendarDays size={16} />
      Open schedule
    </a>
  </section>

  <section class="dashboard-metrics">
    <a href={`/projects/${data.slug}/schedule`}>
      <CalendarDays size={19} />
      <span>Schedule activities</span>
      <strong>{data.schedule.length}</strong>
    </a>
    <a href={`/projects/${data.slug}/submittals`}>
      <FileText size={19} />
      <span>Open submittals</span>
      <strong>{openSubmittals.length}</strong>
    </a>
    <a href={`/projects/${data.slug}/rfis`}>
      <MessageSquare size={19} />
      <span>Open RFIs</span>
      <strong>{openRfis.length}</strong>
    </a>
    <a href={`/projects/${data.slug}/files`}>
      <FolderOpen size={19} />
      <span>Drawings</span>
      <strong>{drawingCount}</strong>
    </a>
    <a href={`/projects/${data.slug}/directory`}>
      <Users size={19} />
      <span>Team</span>
      <strong>{data.directory.length}</strong>
    </a>
  </section>

  <section class="dashboard-grid">
    <div class="panel dashboard-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Look ahead</span>
          <h2>Upcoming schedule</h2>
        </div>
        <a href={`/projects/${data.slug}/schedule`}>View Gantt</a>
      </div>
      <div class="schedule-list">
        {#each nextActivities as item}
          <a href={`/projects/${data.slug}/schedule`}>
            <span>{formatDate(item.startDate)} - {formatDate(item.endDate)}</span>
            <strong>{item.title}</strong>
            <small>{item.phase}</small>
          </a>
        {:else}
          <p class="empty-note">No schedule activities have been imported yet.</p>
        {/each}
      </div>
    </div>

    <div class="panel dashboard-panel">
      <div class="panel-heading">
        <div>
          <span class="eyebrow">Updates</span>
          <h2>Latest project notes</h2>
        </div>
        <a href={`/projects/${data.slug}/updates`}>All updates</a>
      </div>
      <div class="updates-list">
        {#each data.updates.slice(0, 4) as update}
          <article>
            <div>
              <h3>{update.title}</h3>
              <span>{relativeTime(update.postedDate)}</span>
            </div>
            <p>{update.body}</p>
          </article>
        {:else}
          <p class="empty-note">No updates posted yet.</p>
        {/each}
      </div>
    </div>
  </section>
</PageShell>

<style>
  .dashboard-hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(31, 35, 32, 0.1);
  }

  .dashboard-hero h1 {
    margin: 0.2rem 0 0;
    max-width: 58rem;
    color: #191b19;
    font-size: clamp(1.65rem, 3vw, 2.75rem);
    font-weight: 950;
    line-height: 1.05;
  }

  .dashboard-hero p:last-child {
    margin-top: 0.45rem;
    color: #667067;
    font-size: 0.95rem;
    line-height: 1.5;
  }

  .dashboard-metrics {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .dashboard-metrics a {
    display: grid;
    min-height: 7.2rem;
    align-content: space-between;
    padding: 1rem;
    border: 1px solid rgba(31, 35, 32, 0.09);
    border-radius: 0.65rem;
    background: #fff;
    transition:
      transform 150ms ease,
      border-color 150ms ease,
      box-shadow 150ms ease;
  }

  .dashboard-metrics a:hover {
    transform: translateY(-1px);
    border-color: rgba(20, 146, 52, 0.35);
    box-shadow: 0 16px 36px -32px rgba(0, 0, 0, 0.45);
  }

  .dashboard-metrics :global(svg) {
    color: #149234;
  }

  .dashboard-metrics span {
    color: #667067;
    font-size: 0.76rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .dashboard-metrics strong {
    color: #191b19;
    font-size: 2rem;
    font-weight: 950;
    line-height: 1;
  }

  .dashboard-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
    gap: 1rem;
  }

  .dashboard-panel {
    border-radius: 0.7rem;
    padding: 1rem;
  }

  .panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.8rem;
  }

  .panel-heading h2 {
    margin: 0.1rem 0 0;
    color: #191b19;
    font-size: 1.1rem;
    font-weight: 900;
  }

  .panel-heading a {
    color: #149234;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .schedule-list,
  .updates-list {
    display: grid;
    gap: 0.55rem;
  }

  .schedule-list a,
  .updates-list article {
    padding: 0.85rem;
    border: 1px solid rgba(31, 35, 32, 0.08);
    border-radius: 0.55rem;
    background: rgba(255, 255, 255, 0.82);
  }

  .schedule-list span {
    color: #667067;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .schedule-list strong,
  .updates-list h3 {
    display: block;
    margin-top: 0.18rem;
    color: #191b19;
    font-size: 0.92rem;
    font-weight: 900;
  }

  .schedule-list small,
  .updates-list span,
  .updates-list p,
  .empty-note {
    color: #687168;
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .updates-list article > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .updates-list h3 {
    margin: 0;
  }

  .updates-list p {
    display: -webkit-box;
    margin: 0.35rem 0 0;
    overflow: hidden;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  @media (max-width: 980px) {
    .dashboard-hero,
    .panel-heading {
      align-items: stretch;
      flex-direction: column;
    }

    .dashboard-hero .btn {
      width: 100%;
    }

    .dashboard-metrics {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dashboard-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
