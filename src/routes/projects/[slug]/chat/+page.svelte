<script lang="ts">
  import { enhance } from '$app/forms';
  import { Check, MessageSquarePlus, Send, Trash2 } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import { initialsFor, relativeTime } from '$lib/utils';

  let { data, form } = $props();
  let active = $state('');
  let newSubject = $state(false);
  const selected = $derived(data.subjects.find((subject) => subject.id === active) ?? data.subjects[0]);

  $effect(() => {
    if (!active && data.subjects[0]) active = data.subjects[0].id;
  });
</script>

<svelte:head>
  <title>Chat | {data.project?.title}</title>
</svelte:head>

<PageShell wide flush>
  <div class="grid min-h-[620px] min-w-0 border-t border-black/8 bg-white lg:h-[calc(100vh-145px)] lg:grid-cols-[330px_minmax(0,1fr)]">
    <aside class="min-w-0 border-r border-black/8 bg-white">
      <div class="border-b border-black/8 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Project chat</p>
            <h1 class="text-lg font-black text-pe-body">Subjects</h1>
          </div>
          <button class="btn btn-secondary min-h-9 px-2" type="button" aria-label="New subject" onclick={() => (newSubject = !newSubject)}>
            <MessageSquarePlus size={16} />
          </button>
        </div>
        {#if newSubject}
          <form class="subject-create mt-4 space-y-2" method="post" action="?/createSubject" enctype="multipart/form-data" use:enhance>
            <input class="field" name="title" placeholder="Subject" required />
            <textarea class="field min-h-20" name="body" placeholder="First message"></textarea>
            {#if data.chatAccess?.canAttach}
              <AttachmentFields
                files={data.files}
                projectSlug={data.project?.id ?? ''}
                folderName="Chat Attachments"
                idPrefix="new-chat-subject"
                uploadLabel="Upload chat files"
                existingLabel="Attach existing files"
              />
            {/if}
            <button class="btn btn-primary w-full" type="submit">Create</button>
          </form>
        {/if}
      </div>
      <div class="overflow-y-auto p-2">
        {#each data.subjects as subject}
          <div class={`subject-row ${selected?.id === subject.id ? 'active' : ''}`}>
            <button class="subject" onclick={() => (active = subject.id)}>
              <span class="font-black">{subject.name}</span>
              <span class="line-clamp-1 text-xs text-pe-sub">{subject.description}</span>
              <span class="text-xs font-bold text-pe-sub">{subject.messageCount} messages{subject.unreadCount ? ` - ${subject.unreadCount} unread` : ''}</span>
            </button>
            {#if data.chatAccess?.canDelete}
              <form
                method="post"
                action="?/deleteSubject"
                use:enhance
                onsubmit={(event) => {
                  if (!confirm(`Delete "${subject.name}" and all messages in it?`)) event.preventDefault();
                }}
              >
                <input type="hidden" name="subjectId" value={subject.id} />
                <button class="delete-chat-button" type="submit" aria-label={`Delete ${subject.name}`} title={`Delete ${subject.name}`}>
                  <Trash2 size={15} />
                </button>
              </form>
            {/if}
          </div>
        {/each}
      </div>
    </aside>

    <section class="flex min-w-0 flex-col">
      {#if form?.error}
        <div class="border-b border-red-200 bg-red-50 px-5 py-2 text-sm font-semibold text-red-700">{form.error}</div>
      {/if}
      {#if selected}
        <div class="border-b border-black/8 bg-white/70 px-6 py-4">
          <h2 class="text-lg font-black text-pe-body">{selected.name}</h2>
          <p class="mt-1 text-sm text-pe-sub">{selected.participants.slice(0, 5).join(', ') || 'Project team'}</p>
          {#if selected.unreadCount}
            <form class="mt-3" method="post" action="?/markRead" use:enhance>
              <input type="hidden" name="subjectId" value={selected.id} />
              <button class="btn btn-secondary min-h-8 px-2 text-xs" type="submit"><Check size={14} />Mark read</button>
            </form>
          {/if}
        </div>
        <div class="flex-1 space-y-4 overflow-y-auto p-6">
          {#each selected.messages as message}
            <article class="flex min-w-0 gap-3">
              <div class="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pe-green text-xs font-black text-white">{initialsFor({ full_name: message.author, email: null })}</div>
              <div class="min-w-0 max-w-3xl">
                <div class="mb-1 flex items-center gap-2 text-xs font-bold text-pe-sub">
                  <span class="text-pe-body">{message.author}</span>
                  <span>{message.role}</span>
                  <span>{relativeTime(message.timestamp)}</span>
                </div>
                <div class="overflow-wrap-anywhere rounded-xl border border-black/8 bg-white px-4 py-3 text-sm leading-6 text-pe-body">{message.body}</div>
                {#if message.attachments?.length}
                  <div class="mt-2">
                    <AttachmentChips attachments={message.attachments} projectSlug={data.project?.id ?? ''} />
                  </div>
                {/if}
              </div>
              {#if data.chatAccess?.canDelete}
                <form
                  class="ml-auto"
                  method="post"
                  action="?/deleteMessage"
                  use:enhance
                  onsubmit={(event) => {
                    if (!confirm('Delete this chat message?')) event.preventDefault();
                  }}
                >
                  <input type="hidden" name="messageId" value={message.id} />
                  <button class="delete-message-button" type="submit" aria-label="Delete chat message" title="Delete chat message">
                    <Trash2 size={14} />
                  </button>
                </form>
              {/if}
            </article>
          {/each}
        </div>
        <form class="border-t border-black/8 bg-white/76 p-4" method="post" action="?/postMessage" enctype="multipart/form-data" use:enhance>
          <input type="hidden" name="subjectId" value={selected.id} />
          <div class="grid gap-3">
            <textarea class="field min-h-12 flex-1 resize-none" name="body" placeholder="Type a message"></textarea>
            {#if data.chatAccess?.canAttach}
              <AttachmentFields
                files={data.files}
                projectSlug={data.project?.id ?? ''}
                folderName="Chat Attachments"
                idPrefix={`chat-${selected.id}`}
                uploadLabel="Upload chat files"
                existingLabel="Attach existing files"
              />
            {/if}
            <button class="btn btn-primary sm:w-fit" type="submit"><Send size={16} />Send</button>
          </div>
        </form>
      {:else}
        <div class="grid flex-1 place-items-center p-8 text-center">
          <div>
            <h2 class="text-lg font-black text-pe-body">No chat subjects yet</h2>
            <p class="mt-2 text-sm text-pe-sub">Create a subject to start a project discussion.</p>
          </div>
        </div>
      {/if}
    </section>
  </div>
</PageShell>

<style>
  .subject-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-left: 3px solid transparent;
    border-radius: 0.5rem;
    transition:
      background-color 150ms ease,
      border-color 150ms ease;
  }

  .subject-row:hover,
  .subject-row.active {
    border-left-color: #18a53a;
    background: rgba(25, 27, 25, 0.055);
  }

  .subject {
    display: grid;
    width: 100%;
    gap: 0.25rem;
    border: 0;
    background: transparent;
    padding: 0.8rem;
    text-align: left;
  }

  .overflow-wrap-anywhere {
    overflow-wrap: anywhere;
  }

  :global(.subject-create .attachment-fields) {
    grid-template-columns: 1fr;
  }

  .delete-chat-button,
  .delete-message-button {
    display: inline-grid;
    width: 2rem;
    height: 2rem;
    place-items: center;
    border-radius: 0.35rem;
    color: #9a3412;
  }

  .delete-chat-button:hover,
  .delete-message-button:hover {
    background: #fff1ed;
    color: #b42318;
  }
</style>
