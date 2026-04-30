<script lang="ts">
  import { enhance } from '$app/forms';
  import { Bell, MessageSquare, Newspaper, Send, ThumbsUp } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { relativeTime } from '$lib/utils';

  let { data, form } = $props();
  let compose = $state(false);
  const canPost = $derived(data.updateAccess?.canPost ?? true);
  const canAttachFiles = $derived(data.updateAccess?.canAttachFiles ?? true);
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
    {#if canPost}
      <button class="btn btn-primary" type="button" onclick={() => (compose = !compose)}>
        <Newspaper size={16} />
        Post update
      </button>
    {/if}
  </div>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}

  {#if compose && canPost}
    <form class="panel mb-6 grid gap-4 rounded-xl p-5" method="post" action="?/postUpdate" enctype="multipart/form-data" use:enhance>
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
      {#if canAttachFiles}
        <input type="hidden" name="attachmentIds" value="" />
        <AttachmentFields
          files={data.files}
          projectSlug={data.project?.id ?? ''}
          folderName="Update Attachments"
          idPrefix="update-attachments"
          uploadLabel="Upload update files"
          existingLabel="Attach existing project files"
        />
      {/if}
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
        {#if update.attachments?.length}
          <div class="mt-4">
            <AttachmentChips attachments={update.attachments} projectSlug={data.project?.id ?? ''} />
          </div>
        {/if}
        <div class="update-actions">
          <form method="post" action="?/toggleLike" use:enhance>
            <input type="hidden" name="updateId" value={update.id} />
            <button class:active={update.likedByMe} class="mini-action" type="submit">
              <ThumbsUp size={14} />
              {update.likes}
            </button>
          </form>
          <span class="mini-action inert"><MessageSquare size={14} />{update.commentCount}</span>
        </div>
        {#if update.comments?.length}
          <div class="comment-list">
            {#each update.comments as comment}
              <div>
                <strong>{comment.author}</strong>
                <span>{relativeTime(comment.createdAt)}</span>
                <p>{comment.body}</p>
              </div>
            {/each}
          </div>
        {/if}
        <form class="comment-form" method="post" action="?/addComment" use:enhance>
          <input type="hidden" name="updateId" value={update.id} />
          <input class="field compact" name="body" placeholder="Add a comment" required />
          <button class="btn btn-secondary min-h-9 px-3 text-xs" type="submit">Comment</button>
        </form>
      </article>
    {/each}
  </section>
</PageShell>

<style>
  .update-actions {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    margin-top: 1rem;
  }

  .mini-action {
    display: inline-flex;
    align-items: center;
    gap: 0.32rem;
    min-height: 2rem;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.35rem 0.55rem;
    color: #303830;
    font-size: 0.75rem;
    font-weight: 850;
  }

  .mini-action.active {
    border-color: rgba(24, 165, 58, 0.32);
    background: rgba(29, 175, 63, 0.08);
    color: #244225;
  }

  .mini-action.inert {
    pointer-events: none;
  }

  .comment-list {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.85rem;
  }

  .comment-list > div {
    border-left: 3px solid rgba(25, 27, 25, 0.12);
    padding-left: 0.65rem;
  }

  .comment-list strong,
  .comment-list span,
  .comment-list p {
    display: block;
    margin: 0.05rem 0 0;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .comment-list strong {
    color: #191b19;
    font-weight: 850;
  }

  .comment-list span,
  .comment-list p {
    color: #4f594f;
  }

  .comment-form {
    display: grid;
    gap: 0.5rem;
    grid-template-columns: minmax(0, 1fr) auto;
    margin-top: 0.8rem;
  }

  @media (max-width: 640px) {
    .comment-form {
      grid-template-columns: 1fr;
    }
  }
</style>
