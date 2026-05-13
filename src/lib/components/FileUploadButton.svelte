<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { UploadCloud } from '@lucide/svelte';
  import { uploadProjectFile } from '$lib/client/project-file-upload';

  const CUSTOM_FOLDER_VALUE = '__custom-folder__';

  let {
    projectSlug,
    folderName = '',
    fullWidth = false,
    folderEditable = false,
    folderLabel = 'Folder',
    folderPlaceholder = 'Folder name',
    folderOptions = [],
    documentKind = 'file'
  }: {
    projectSlug: string;
    folderName?: string;
    fullWidth?: boolean;
    folderEditable?: boolean;
    folderLabel?: string;
    folderPlaceholder?: string;
    folderOptions?: string[];
    documentKind?: 'drawing' | 'specification' | 'file';
  } = $props();
  let input: HTMLInputElement;
  let selectedFolderName = $state('');
  let folderSelectValue = $state('');
  let customFolderName = $state('');
  let lastIncomingFolderName = $state('');
  let uploading = $state(false);
  let draggingFiles = $state(false);
  let message = $state('');

  const normalizedFolderOptions = $derived(
    [...new Set(folderOptions.map((option) => option.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
  );
  const selectedUploadFolderName = $derived(
    normalizedFolderOptions.length
      ? folderSelectValue === CUSTOM_FOLDER_VALUE
        ? customFolderName
        : folderSelectValue
      : selectedFolderName
  );

  function syncFolderSelection(value: string) {
    selectedFolderName = value;
    if (!normalizedFolderOptions.length) {
      folderSelectValue = '';
      customFolderName = '';
      return;
    }

    if (!value || normalizedFolderOptions.includes(value)) {
      folderSelectValue = value;
      customFolderName = '';
      return;
    }

    folderSelectValue = CUSTOM_FOLDER_VALUE;
    customFolderName = value;
  }

  function hasDraggedFiles(event: DragEvent) {
    const transfer = event.dataTransfer;
    if (!transfer) return false;
    if (transfer.items?.length) return Array.from(transfer.items).some((item) => item.kind === 'file');
    return transfer.files.length > 0;
  }

  $effect(() => {
    if (folderName !== lastIncomingFolderName) {
      syncFolderSelection(folderName);
      lastIncomingFolderName = folderName;
    }
  });

  async function uploadOne(file: File) {
    const result = await uploadProjectFile({
      projectSlug,
      file,
      folderName: selectedUploadFolderName.trim(),
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

  function onDragEnter(event: DragEvent) {
    if (uploading || !hasDraggedFiles(event)) return;
    draggingFiles = true;
  }

  function onDragOver(event: DragEvent) {
    if (uploading || !hasDraggedFiles(event)) return;
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'copy';
    draggingFiles = true;
  }

  function onDragLeave(event: DragEvent) {
    const currentTarget = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as Node | null;
    if (!relatedTarget || !currentTarget.contains(relatedTarget)) draggingFiles = false;
  }

  function onDrop(event: DragEvent) {
    if (uploading || !hasDraggedFiles(event)) return;
    event.preventDefault();
    draggingFiles = false;
    void upload(Array.from(event.dataTransfer?.files ?? []));
  }
</script>

<div
  class={`upload-button-shell ${fullWidth ? 'full-width' : ''}`}
  class:dragging-files={draggingFiles}
  role="group"
  aria-label="File upload"
  ondragenter={onDragEnter}
  ondragover={onDragOver}
  ondragleave={onDragLeave}
  ondrop={onDrop}
>
  <input bind:this={input} class="sr-only" type="file" multiple onchange={onChange} />
  <div class={`upload-control-row ${folderEditable ? 'with-folder' : ''} ${fullWidth ? 'full-width' : ''}`}>
    {#if folderEditable}
      <label class="upload-group-field">
        <span>{folderLabel}</span>
        {#if normalizedFolderOptions.length}
          <select class="field" bind:value={folderSelectValue} disabled={uploading} aria-label={folderLabel}>
            <option value="">No folder</option>
            {#each normalizedFolderOptions as option}
              <option value={option}>{option}</option>
            {/each}
            <option value={CUSTOM_FOLDER_VALUE}>New folder...</option>
          </select>
          {#if folderSelectValue === CUSTOM_FOLDER_VALUE}
            <input class="field" bind:value={customFolderName} placeholder={folderPlaceholder} disabled={uploading} />
          {/if}
        {:else}
          <input class="field" bind:value={selectedFolderName} placeholder={folderPlaceholder} disabled={uploading} />
        {/if}
      </label>
    {/if}
    <button class={`btn btn-primary ${fullWidth && !folderEditable ? 'w-full' : ''}`} type="button" disabled={uploading} onclick={() => input?.click()} title="Upload files">
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
    border: 1px solid transparent;
    border-radius: 0.45rem;
    padding: 0.2rem;
    transition:
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .upload-button-shell.full-width {
    justify-items: stretch;
  }

  .upload-button-shell.dragging-files {
    border-color: rgba(24, 165, 58, 0.45);
    background: rgba(24, 165, 58, 0.08);
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

  .upload-group-field input,
  .upload-group-field select {
    min-height: 2.1rem;
    border-radius: 0.28rem;
    padding: 0.42rem 0.55rem;
    font-size: 0.8rem;
    font-weight: 750;
  }

  .upload-group-field select {
    cursor: pointer;
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
