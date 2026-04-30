<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { UploadCloud } from '@lucide/svelte';
  import { uploadProjectFile } from '$lib/client/project-file-upload';

  let {
    projectSlug,
    folderName = '',
    fullWidth = false,
    folderEditable = false,
    folderLabel = 'Folder',
    folderPlaceholder = 'Folder name',
    documentKind = 'file'
  }: {
    projectSlug: string;
    folderName?: string;
    fullWidth?: boolean;
    folderEditable?: boolean;
    folderLabel?: string;
    folderPlaceholder?: string;
    documentKind?: 'drawing' | 'specification' | 'file';
  } = $props();
  let input: HTMLInputElement;
  let selectedFolderName = $state('');
  let lastIncomingFolderName = $state('');
  let uploading = $state(false);
  let message = $state('');

  $effect(() => {
    if (folderName !== lastIncomingFolderName) {
      selectedFolderName = folderName;
      lastIncomingFolderName = folderName;
    }
  });

  async function uploadOne(file: File) {
    const result = await uploadProjectFile({
      projectSlug,
      file,
      folderName: selectedFolderName.trim(),
      documentKind,
      onPortalFallback: () => {
        message = `Direct upload was blocked by the browser; finishing ${file.name} through the portal...`;
      }
    });
    return result.warning ? `${result.name} uploaded. ${result.warning}` : `${result.name} uploaded.`;
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;
    uploading = true;
    message = '';

    try {
      for (const file of files) {
        message = `Uploading ${file.name}...`;
        message = await uploadOne(file);
      }
      message = files.length === 1 ? message : `${files.length} files uploaded.`;
      await invalidateAll();
    } catch (error) {
      message = error instanceof Error ? error.message : 'Upload failed.';
    } finally {
      uploading = false;
      if (input) input.value = '';
    }
  }

  function onChange() {
    void upload(Array.from(input.files ?? []));
  }
</script>

<div class={`upload-button-shell ${fullWidth ? 'full-width' : ''}`}>
  <input bind:this={input} class="sr-only" type="file" multiple onchange={onChange} />
  <div class={`upload-control-row ${folderEditable ? 'with-folder' : ''} ${fullWidth ? 'full-width' : ''}`}>
    {#if folderEditable}
      <label class="upload-group-field">
        <span>{folderLabel}</span>
        <input class="field" bind:value={selectedFolderName} placeholder={folderPlaceholder} disabled={uploading} />
      </label>
    {/if}
    <button class={`btn btn-primary ${fullWidth && !folderEditable ? 'w-full' : ''}`} type="button" disabled={uploading} onclick={() => input?.click()}>
      <UploadCloud size={16} />
      {uploading ? 'Uploading...' : 'Upload files'}
    </button>
  </div>
  {#if message}
    <p class={`upload-message ${fullWidth ? 'text-left' : 'text-right'}`}>{message}</p>
  {/if}
</div>

<style>
  .upload-button-shell {
    display: grid;
    gap: 0.35rem;
    justify-items: end;
  }

  .upload-button-shell.full-width {
    justify-items: stretch;
  }

  .upload-control-row {
    display: flex;
    align-items: end;
    justify-content: flex-end;
    gap: 0.55rem;
    min-width: 0;
  }

  .upload-control-row.with-folder {
    flex-wrap: nowrap;
  }

  .upload-control-row.full-width {
    justify-content: stretch;
  }

  .upload-group-field {
    display: grid;
    gap: 0.25rem;
    flex: 1 1 17rem;
    width: min(18rem, 42vw);
    min-width: 14rem;
    text-align: left;
  }

  .upload-group-field span {
    color: #4b514c;
    font-size: 0.72rem;
    font-weight: 850;
  }

  .upload-group-field input {
    min-height: 2.1rem;
    border-radius: 0.28rem;
    padding: 0.42rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 750;
  }

  .upload-message {
    max-width: 28rem;
    color: #59615a;
    font-size: 0.75rem;
    font-weight: 750;
  }

  @media (max-width: 760px) {
    .upload-control-row.with-folder {
      align-items: stretch;
      flex-wrap: wrap;
    }

    .upload-group-field,
    .upload-control-row.with-folder :global(.btn) {
      width: 100%;
      min-width: 0;
    }
  }
</style>
