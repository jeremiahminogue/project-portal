<script lang="ts">
  import { Link, UploadCloud } from '@lucide/svelte';

  let {
    files = [],
    idPrefix = 'attachments',
    uploadLabel = 'Upload attachments',
    existingLabel = 'Attach existing project files',
    maxFiles = 10,
    maxFileMb = 100
  }: {
    files?: { id: string; path: string; size: string }[];
    idPrefix?: string;
    uploadLabel?: string;
    existingLabel?: string;
    maxFiles?: number;
    maxFileMb?: number;
  } = $props();

  let uploadInput: HTMLInputElement | undefined = $state();
  let selectedFileNames = $state<string[]>([]);
  let isDragging = $state(false);

  const attachableFiles = $derived(files.filter((file) => !file.id.startsWith('storage:')));
  const existingPickerSize = $derived(Math.min(5, Math.max(2, attachableFiles.length)));
  const selectedCountLabel = $derived(
    selectedFileNames.length === 1 ? '1 file selected' : `${selectedFileNames.length} files selected`
  );
  const tooManyFiles = $derived(selectedFileNames.length > maxFiles);

  function updateSelectedFiles() {
    selectedFileNames = Array.from(uploadInput?.files ?? []).map((file) => file.name);
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

    const transfer = new DataTransfer();
    for (const file of Array.from(uploadInput.files ?? [])) transfer.items.add(file);
    for (const file of droppedFiles) transfer.items.add(file);
    uploadInput.files = transfer.files;
    updateSelectedFiles();
  }
</script>

<div class="attachment-fields">
  <div
    class:dragging={isDragging}
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
    <small>Drag files here or browse. Up to {maxFiles} files, {maxFileMb} MB each.</small>
    <button class="browse-control" type="button" onclick={browseFiles}>
      <UploadCloud size={16} />
      Browse files
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
    {#if selectedFileNames.length}
      <em class:warning={tooManyFiles}>
        {selectedCountLabel}{tooManyFiles ? ` - limit ${maxFiles}` : ''}
        {#if selectedFileNames.length <= 3}
          : {selectedFileNames.join(', ')}
        {/if}
      </em>
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

  @media (max-width: 760px) {
    .attachment-fields {
      grid-template-columns: 1fr;
    }
  }
</style>
