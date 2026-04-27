<script lang="ts">
  import { enhance } from '$app/forms';
  import { Bell, Newspaper, Send } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { relativeTime } from '$lib/utils';

  let { data, form } = $props();
  let compose = $state(false);
</script>

<svelte:head>
  <title>Updates | {data.project?.title}</title>
</svelte:head>

<PageShell>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">{data.project?.title}</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Updates</h1>
      <p class="mt-2 text-sm leading-6 text-pe-sub">Project notices, OAC notes, weekly updates, and phase announcements.</p>
    </div>
    <button class="btn btn-primary" type="button" onclick={() => (compose = !compose)}>
      <Newspaper size={16} />
      Post update
    </button>
  </div>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}

  {#if compose}
    <form class="panel mb-6 grid gap-4 rounded-xl p-5" method="post" action="?/postUpdate" use:enhance>
      <div class="grid gap-4 md:grid-cols-[220px_1fr]">
        <div>
          <label class="label" for="kind">Type</label>
          <select id="kind" name="kind" class="field">
            <option value="general">General</option>
            <option value="oac_recap">OAC Recap</option>
            <option value="weekly">Weekly</option>
            <option value="phase_kickoff">Phase Kickoff</option>
            <option value="safety">Safety</option>
          </select>
        </div>
        <div>
          <label class="label" for="title">Title</label>
          <input id="title" name="title" class="field" required />
        </div>
      </div>
      <div>
        <label class="label" for="body">Body</label>
        <textarea id="body" name="body" class="field min-h-36" required></textarea>
      </div>
      <label class="flex items-center gap-2 text-sm font-bold text-pe-body">
        <input type="checkbox" name="notify" />
        <Bell size={16} />
        Email project team
      </label>
      <button class="btn btn-primary w-fit" type="submit"><Send size={16} />Publish</button>
    </form>
  {/if}

  <section class="space-y-4">
    {#each data.updates as update}
      <article class="panel lift rounded-xl p-5">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <StatusPill label={update.type} />
            <span class="text-xs font-bold text-pe-sub">{relativeTime(update.postedDate)} by {update.author}</span>
          </div>
          <span class="text-xs font-bold text-pe-sub">{update.commentCount} comments</span>
        </div>
        <h2 class="text-lg font-black text-pe-body">{update.title}</h2>
        <p class="mt-3 whitespace-pre-line text-sm leading-7 text-pe-sub">{update.body}</p>
      </article>
    {/each}
  </section>
</PageShell>
