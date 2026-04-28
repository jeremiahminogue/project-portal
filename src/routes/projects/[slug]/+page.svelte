<script lang="ts">
  import { enhance } from '$app/forms';
  import { CalendarDays, Camera, FileText, FolderOpen, MessageSquare, Save, Users } from '@lucide/svelte';
  import FileUploadButton from '$lib/components/FileUploadButton.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate, relativeTime } from '$lib/utils';

  let { data, form } = $props();
  const project = $derived(data.project);
  const openSubmittals = $derived(data.submittals.filter((item) => !['Approved', 'Rejected'].includes(item.status)));
  const openRfis = $derived(data.rfis.filter((item) => item.status === 'Open'));
  const nextActivities = $derived(data.schedule.slice(0, 5));
  let percentComplete = $state(0);
  const progressPhotos = $derived(
    data.files
      .filter((file) => {
        const path = `${file.path} ${file.name}`.toLowerCase();
        return file.type === 'image' && (path.includes('progress photo') || path.includes('progress photos') || path.includes('pictures'));
      })
      .slice(0, 8)
  );

  const phaseOptions = [
    { value: 'pre_con', label: 'Pre-Con' },
    { value: 'design', label: 'Design' },
    { value: 'construction', label: 'Construction' },
    { value: 'closeout', label: 'Closed' }
  ];

  function phaseFromStatus(status: string) {
    if (status === 'Design') return 'design';
    if (status === 'Construction') return 'construction';
    if (status === 'Closed') return 'closeout';
    return 'pre_con';
  }

  function fileHref(id: string) {
    return `/api/files/${encodeURIComponent(id)}/download`;
  }

  $effect(() => {
    percentComplete = project.completionPercent;
  });
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
      <div class="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 class="text-base font-black text-pe-body">Project progress</h2>
          <p class="mt-1 text-xs font-bold text-pe-sub">{project.nextMilestone || 'Milestone not set'}</p>
        </div>
        <StatusPill label={project.status} />
      </div>

      {#if form?.error}
        <div class="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
      {:else if form?.saved}
        <div class="mb-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">{form.saved}</div>
      {/if}

      <form class="progress-form" method="post" action="?/updateProgress" use:enhance>
        <div>
          <label class="label" for="phase">Status</label>
          <select id="phase" name="phase" class="field" disabled={!data.progressAccess.canEdit}>
            {#each phaseOptions as option}
              <option value={option.value} selected={option.value === phaseFromStatus(project.status)}>{option.label}</option>
            {/each}
          </select>
        </div>
        <div>
          <div class="mb-1 flex items-center justify-between gap-3">
            <label class="label mb-0" for="percentComplete">Complete</label>
            <span class="progress-value">{percentComplete}%</span>
          </div>
          <input
            id="percentComplete"
            name="percentComplete"
            class="progress-slider"
            type="range"
            min="0"
            max="100"
            bind:value={percentComplete}
            disabled={!data.progressAccess.canEdit}
          />
        </div>
        <div>
          <label class="label" for="nextMilestone">Next milestone</label>
          <input id="nextMilestone" name="nextMilestone" class="field" value={project.nextMilestone} disabled={!data.progressAccess.canEdit} />
        </div>
        <div>
          <label class="label" for="nextMilestoneDate">Milestone date</label>
          <input
            id="nextMilestoneDate"
            name="nextMilestoneDate"
            class="field"
            type="date"
            value={project.nextMilestoneDate}
            disabled={!data.progressAccess.canEdit}
          />
        </div>
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" type="submit" disabled={!data.progressAccess.canEdit}>
            <Save size={16} />
            Save progress
          </button>
          <a class="btn btn-secondary" href={`/projects/${data.slug}/schedule`} aria-label="View schedule">
            <CalendarDays size={16} />
          </a>
        </div>
      </form>
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

  <section class="panel mb-6 rounded-xl p-5">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div class="flex items-center gap-2">
          <Camera class="text-pe-green" size={20} />
          <h2 class="text-base font-black text-pe-body">Progress photos</h2>
        </div>
        <p class="mt-1 text-xs font-bold text-pe-sub">{progressPhotos.length} jobsite photo{progressPhotos.length === 1 ? '' : 's'}</p>
      </div>
      {#if data.photoAccess.canUpload}
        <FileUploadButton
          projectSlug={data.project.id}
          folderName="Progress Photos"
          accept="image/*"
          buttonLabel="Upload photos"
        />
      {/if}
    </div>

    {#if progressPhotos.length}
      <div class="photo-grid">
        {#each progressPhotos as photo}
          <a class="photo-card" href={fileHref(photo.id)} target="_blank" rel="noreferrer">
            <img src={fileHref(photo.id)} alt={photo.name} loading="lazy" />
            <span>{photo.name}</span>
          </a>
        {/each}
      </div>
    {:else}
      <div class="empty-photos">
        <Camera size={22} />
        <span>No progress photos uploaded yet.</span>
      </div>
    {/if}
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

<style>
  .progress-form {
    display: grid;
    gap: 0.9rem;
  }

  .progress-value {
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 999px;
    background: #fff;
    padding: 0.18rem 0.55rem;
    color: #202520;
    font-size: 0.78rem;
    font-weight: 900;
  }

  .progress-slider {
    width: 100%;
    accent-color: #2f6f3e;
  }

  .photo-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.85rem;
  }

  .photo-card {
    display: grid;
    gap: 0.45rem;
    color: #202520;
    font-size: 0.78rem;
    font-weight: 850;
  }

  .photo-card img {
    aspect-ratio: 4 / 3;
    width: 100%;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.45rem;
    background: #f2f4f1;
    object-fit: cover;
  }

  .photo-card span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .empty-photos {
    display: flex;
    min-height: 7rem;
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    border: 1px dashed rgba(25, 27, 25, 0.16);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.55);
    color: #697169;
    font-size: 0.85rem;
    font-weight: 850;
  }
</style>
