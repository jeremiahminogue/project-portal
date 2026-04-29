<script lang="ts">
  import { Download, Paperclip } from '@lucide/svelte';

  let {
    attachments = [],
    emptyLabel = '',
    downloadAllHref = '',
    downloadAllLabel = 'Download all'
  }: {
    attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
    emptyLabel?: string;
    downloadAllHref?: string;
    downloadAllLabel?: string;
  } = $props();
</script>

{#if attachments.length}
  <div class="attachment-strip" aria-label="Attachments">
    {#each attachments as attachment}
      {#if attachment.id}
        <a
          class="attachment-chip"
          href={`/api/files/${encodeURIComponent(attachment.id)}/download?download=1`}
          title={attachment.path ?? attachment.name}
        >
          <Paperclip size={14} />
          <span>{attachment.name}</span>
          <small>{attachment.size}</small>
          <Download size={13} />
        </a>
      {:else}
        <span class="attachment-chip" title={attachment.path ?? attachment.name}>
          <Paperclip size={14} />
          <span>{attachment.name}</span>
          <small>{attachment.size}</small>
        </span>
      {/if}
    {/each}
    {#if downloadAllHref && attachments.some((attachment) => attachment.id)}
      <a class="attachment-chip attachment-download-all" href={downloadAllHref}>
        <Download size={14} />
        <span>{downloadAllLabel}</span>
      </a>
    {/if}
  </div>
{:else if emptyLabel}
  <p class="attachment-empty">{emptyLabel}</p>
{/if}

<style>
  .attachment-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    min-width: 0;
  }

  .attachment-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.38rem;
    max-width: 100%;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.42rem 0.55rem;
    color: #222622;
    font-size: 0.78rem;
    font-weight: 800;
  }

  .attachment-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip small {
    color: #697169;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .attachment-download-all {
    border-color: rgba(55, 95, 56, 0.22);
    background: rgba(55, 95, 56, 0.07);
    color: #244225;
  }

  .attachment-empty {
    margin: 0;
    color: #697169;
    font-size: 0.78rem;
    font-weight: 750;
  }
</style>
