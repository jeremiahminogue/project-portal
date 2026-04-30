<script lang="ts">
  import { onMount } from 'svelte';
  import { Link, UploadCloud, X } from '@lucide/svelte';
  import { uploadProjectFile, type UploadedProjectFile } from '$lib/client/project-file-upload';

  let {
    files = [],
    projectSlug = '',
    folderName = 'Attachments',
    documentKind = 'file',
    tags = ['attachment'],
    idPrefix = 'attachments',
    uploadLabel = 'Upload attachments',
    existingLabel = 'Attach existing project files',
    maxFiles = 10,
    maxFileMb = 100
  }: {
    files?: { id: string; path: string; size: string }[];
    projectSlug?: string;
    folderName?: string;
    documentKind?: 'drawing' | 'specification' | 'file';
    tags?: string[];
    idPrefix?: string;
    uploadLabel?: string;
    existingLabel?: string;
    maxFiles?: number;
    maxFileMb?: number;
  } = $props();

  let root: HTMLDivElement | undefined = $state();
  let uploadInput: HTMLInputElement | undefined = $state();
  let selectedFileNames = $state<string[]>([]);
  let uploadedFiles = $state<UploadedProjectFile[]>([]);
  let uploadErrors = $state<string[]>([]);
  let uploadMessage = $state('');
  let isUploading = $state(false);
  let isDragging = $state(false);

  const attachableFiles = $derived(files.filter((file) => !file.id.startsWith('storage:')));
  const existingPickerSize = $derived(Math.min(5, Math.max(2, attachableFiles.length)));
  const directUploadEnabled = $derived(Boolean(projectSlug));
  const attachedUploadCount = $derived(directUploadEnabled ? uploadedFiles.length : selectedFileNames.length);
  const selectedCountLabel = $derived(
    attachedUploadCount === 1 ? '1 file selected' : `${attachedUploadCount} files selected`
  );
  const tooManyFiles = $derived(attachedUploadCount > maxFiles);

  onMount(() => {
    const form = root?.closest('form');
    if (!form) return;

    const clearPendingFiles = () => {
      selectedFileNames = [];
      uploadedFiles = [];
      uploadErrors = [];
      uploadMessage = '';
      isUploading = false;
      if (uploadInput) uploadInput.value = '';
    };

    const handleSubmit = (event: SubmitEvent) => {
      if (!isUploading) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      uploadMessage = 'Finish uploading attachments before saving.';
    };

    form.addEventListener('submit', handleSubmit, true);
    form.addEventListener('reset', clearPendingFiles);
    return () => {
      form.removeEventListener('submit', handleSubmit, true);
      form.removeEventListener('reset', clearPendingFiles);
    };
  });

  function clearUploadInput() {
    if (uploadInput) uploadInput.value = '';
  }

  function updateSelectedFiles() {
    const files = Array.from(uploadInput?.files ?? []);
    if (directUploadEnabled) {
      void uploadFiles(files);
      return;
    }
    selectedFileNames = files.map((file) => file.name);
  }

  function browseFiles() {
    uploadInput?.click();
  }

  function handleDrag(event: DragEvent, active: boolean) {
    event.preventDefault();
    isDragging = active;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    isDragging = false;
    const droppedFiles = Array.from(event.dataTransfer?.files ?? []);
    if (!uploadInput || droppedFiles.length === 0) return;

    if (directUploadEnabled) {
      void uploadFiles(droppedFiles);
      return;
    }

    const transfer = new DataTransfer();
    for (const file of Array.from(uploadInput.files ?? [])) transfer.items.add(file);
    for (const file of droppedFiles) transfer.items.add(file);
    uploadInput.files = transfer.files;
    updateSelectedFiles();
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || !directUploadEnabled) return;
    uploadErrors = [];
    uploadMessage = '';

    if (isUploading) {
      uploadMessage = 'Finish the current upload before adding more files.';
      clearUploadInput();
      return;
    }

    if (uploadedFiles.length + files.length > maxFiles) {
      uploadErrors = [`Attach up to ${maxFiles} files at a time.`];
      clearUploadInput();
      return;
    }

    const tooLarge = files.find((file) => file.size > maxFileMb * 1024 * 1024);
    if (tooLarge) {
      uploadErrors = [`${tooLarge.name} is larger than ${maxFileMb} MB.`];
      clearUploadInput();
      return;
    }

    isUploading = true;
    try {
      for (const file of files) {
        uploadMessage = `Uploading ${file.name}...`;
        const uploaded = await uploadProjectFile({
          projectSlug,
          file,
          folderName,
          documentKind,
          tags,
          onPortalFallback: () => {
            uploadMessage = `Direct upload was blocked by the browser; finishing ${file.name} through the portal...`;
          }
        });
        uploadedFiles = [...uploadedFiles, uploaded];
        if (uploaded.warning) uploadErrors = [...uploadErrors, `${uploaded.name}: ${uploaded.warning}`];
      }
      uploadMessage = files.length === 1 ? `${files[0].name} attached.` : `${files.length} files attached.`;
    } catch (error) {
      uploadErrors = [...uploadErrors, error instanceof Error ? error.message : 'Attachment upload failed.'];
    } finally {
      isUploading = false;
      clearUploadInput();
    }
  }

  function removeUploadedFile(id: string) {
    uploadedFiles = uploadedFiles.filter((file) => file.id !== id);
  }
</script>

<div bind:this={root} class:single-field={!attachableFiles.length} class="attachment-fields">
  <div
    class:dragging={isDragging}
    class:uploading={isUploading}
    class="attachment-field upload-drop"
    role="group"
    aria-labelledby={`${idPrefix}-upload-label`}
    ondragenter={(event) => handleDrag(event, true)}
    ondragover={(event) => handleDrag(event, true)}
    ondragleave={(event) => handleDrag(event, false)}
    ondrop={handleDrop}
  >
    <span id={`${idPrefix}-upload-label`}><UploadCloud size={14} />{uploadLabel}</span>
    <strong>My computer</strong>
    <small>{directUploadEnabled ? 'Files upload now, then attach when you save.' : 'Drag files here or browse.'} Up to {maxFiles} files, {maxFileMb} MB each.</small>
    <button class="browse-control" type="button" onclick={browseFiles} disabled={isUploading}>
      <UploadCloud size={16} />
      {isUploading ? 'Uploading...' : 'Browse files'}
    </button>
    <input
      bind:this={uploadInput}
      id={`${idPrefix}-upload`}
      class="file-input"
      name="attachments"
      type="file"
      multiple
      tabindex="-1"
      onchange={updateSelectedFiles}
    />
    {#each uploadedFiles as file}
      <input type="hidden" name="attachmentIds" value={file.id} />
    {/each}
    {#if attachedUploadCount}
      <em class:warning={tooManyFiles}>
        {selectedCountLabel}{tooManyFiles ? ` - limit ${maxFiles}` : ''}
      </em>
      <ul class="selected-file-list" aria-label="Selected files">
        {#if directUploadEnabled}
          {#each uploadedFiles as file}
            <li>
              <span>{file.name}</span>
              <small>{file.sizeLabel}</small>
              <a href={`/projects/${encodeURIComponent(projectSlug)}/files/${encodeURIComponent(file.id)}`} target="_blank" rel="noreferrer">Preview</a>
              <button type="button" aria-label={`Remove ${file.name}`} onclick={() => removeUploadedFile(file.id)}>
                <X size={13} />
              </button>
            </li>
          {/each}
        {:else}
          {#each selectedFileNames as name}
            <li><span>{name}</span></li>
          {/each}
        {/if}
      </ul>
    {/if}
    {#if uploadMessage}
      <p class="attachment-message" aria-live="polite">{uploadMessage}</p>
    {/if}
    {#if uploadErrors.length}
      <ul class="attachment-errors" aria-label="Attachment upload errors" aria-live="assertive">
        {#each uploadErrors as error}
          <li>{error}</li>
        {/each}
      </ul>
    {/if}
  </div>

  {#if attachableFiles.length}
    <label class="attachment-field existing-files" for={`${idPrefix}-existing`}>
      <span><Link size={14} />{existingLabel}</span>
      <strong>Project files</strong>
      <small>Select one or more files already stored in this project.</small>
      <select id={`${idPrefix}-existing`} class="field project-file-picker" name="attachmentIds" multiple size={existingPickerSize}>
        {#each attachableFiles as file}
          <option value={file.id}>{file.path} ({file.size})</option>
        {/each}
      </select>
    </label>
  {/if}
</div>

<style>
  .attachment-fields {
    display: grid;
    gap: 0.55rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    min-width: 0;
  }

  .attachment-fields.single-field {
    grid-template-columns: 1fr;
  }

  .attachment-field {
    display: grid;
    gap: 0.32rem;
    min-width: 0;
  }

  .attachment-field > span {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    color: #4f594f;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .attachment-field strong {
    color: #222622;
    font-size: 0.86rem;
    font-weight: 850;
  }

  .attachment-field small,
  .attachment-field em {
    color: #697169;
    font-size: 0.72rem;
    font-style: normal;
    font-weight: 700;
    line-height: 1.35;
  }

  .attachment-field em.warning {
    color: #9a3412;
  }

  .selected-file-list {
    display: grid;
    gap: 0.18rem;
    max-height: 7.5rem;
    margin: 0.1rem 0 0;
    overflow: auto;
    padding: 0;
    list-style: none;
  }

  .selected-file-list li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 0.42rem;
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.08);
    border-radius: 0.32rem;
    background: rgba(255, 255, 255, 0.64);
    padding: 0.26rem 0.38rem;
    color: #303830;
    font-size: 0.72rem;
    font-weight: 780;
  }

  .selected-file-list span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selected-file-list small,
  .selected-file-list a {
    font-size: 0.68rem;
    font-weight: 850;
    white-space: nowrap;
  }

  .selected-file-list small {
    color: #697169;
  }

  .selected-file-list a {
    color: #1d5fb8;
    text-decoration: none;
  }

  .selected-file-list a:hover {
    text-decoration: underline;
  }

  .selected-file-list button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.35rem;
    height: 1.35rem;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 999px;
    background: #fff;
    color: #5b625c;
  }

  .selected-file-list button:hover {
    border-color: rgba(154, 52, 18, 0.2);
    color: #9a3412;
  }

  .upload-drop {
    position: relative;
    border: 1px dashed rgba(25, 27, 25, 0.18);
    border-radius: 0.45rem;
    background: rgba(255, 255, 255, 0.55);
    padding: 0.7rem;
    transition:
      border-color 140ms ease,
      background 140ms ease;
  }

  .upload-drop.dragging {
    border-color: #375f38;
    background: rgba(55, 95, 56, 0.08);
  }

  .upload-drop.uploading {
    border-color: rgba(29, 95, 184, 0.28);
    background: rgba(29, 95, 184, 0.06);
  }

  .file-input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    clip-path: inset(50%);
    opacity: 0;
    white-space: nowrap;
  }

  .browse-control {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    justify-content: center;
    width: fit-content;
    min-height: 2.25rem;
    border: 1px solid rgba(25, 27, 25, 0.14);
    border-radius: 0.4rem;
    background: #fff;
    padding: 0.5rem 0.72rem;
    color: #191b19;
    font-size: 0.78rem;
    font-weight: 850;
    line-height: 1;
    transition:
      border-color 140ms ease,
      background-color 140ms ease;
  }

  .browse-control:focus-visible {
    border-color: rgba(29, 175, 63, 0.55);
    box-shadow: 0 0 0 4px rgba(29, 175, 63, 0.11);
    outline: none;
  }

  .browse-control:disabled {
    cursor: wait;
    opacity: 0.72;
  }

  .upload-drop:hover .browse-control,
  .upload-drop.dragging .browse-control {
    border-color: rgba(20, 146, 52, 0.45);
    background: rgba(29, 175, 63, 0.08);
  }

  .existing-files select {
    font-size: 0.75rem;
  }

  .project-file-picker {
    min-height: 5.85rem;
    padding-block: 0.4rem;
  }

  .project-file-picker option {
    padding: 0.22rem 0.2rem;
  }

  .attachment-message,
  .attachment-errors {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 760;
    line-height: 1.35;
  }

  .attachment-message {
    color: #4f594f;
  }

  .attachment-errors {
    display: grid;
    gap: 0.12rem;
    padding: 0;
    color: #9a3412;
    list-style: none;
  }

  @media (max-width: 760px) {
    .attachment-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
