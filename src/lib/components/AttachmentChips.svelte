<script lang="ts">
  import { Download, Eye, Paperclip } from '@lucide/svelte';

  let {
    attachments = [],
    emptyLabel = '',
    projectSlug = '',
    downloadAllHref = '',
    downloadAllLabel = 'Download all'
  }: {
    attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
    emptyLabel?: string;
    projectSlug?: string;
    downloadAllHref?: string;
    downloadAllLabel?: string;
  } = $props();
</script>

{#if attachments.length}
  <div class="attachment-strip" aria-label="Attachments">
    {#each attachments as attachment}
      {#if attachment.id}
        {#if projectSlug}
          <span class="attachment-chip attachment-chip-actions" title={attachment.path ?? attachment.name}>
            <Paperclip size={14} />
            <span>{attachment.name}</span>
            <small>{attachment.size}</small>
            <a
              href={`/projects/${encodeURIComponent(projectSlug)}/files/${encodeURIComponent(attachment.id)}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`Preview ${attachment.name}`}
            >
              <Eye size={13} />
              Preview
            </a>
            <a href={`/api/files/${encodeURIComponent(attachment.id)}/download?download=1`} aria-label={`Download ${attachment.name}`}>
              <Download size={13} />
            </a>
          </span>
        {:else}
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
        {/if}
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
    min-width: 0;
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .attachment-chip :global(svg) {
    flex: 0 0 auto;
  }

  .attachment-chip small {
    color: #697169;
    font-size: 0.68rem;
    font-weight: 800;
    white-space: nowrap;
  }

  .attachment-chip-actions {
    gap: 0.42rem;
  }

  .attachment-chip-actions a {
    display: inline-flex;
    align-items: center;
    gap: 0.22rem;
    color: #1d5fb8;
    font-size: 0.7rem;
    font-weight: 850;
    text-decoration: none;
    white-space: nowrap;
  }

  .attachment-chip-actions a:hover {
    text-decoration: underline;
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
