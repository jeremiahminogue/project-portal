<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { UploadCloud } from '@lucide/svelte';

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
  const portalFallbackLimitBytes = 4 * 1024 * 1024;

  $effect(() => {
    if (folderName !== lastIncomingFolderName) {
      selectedFolderName = folderName;
      lastIncomingFolderName = folderName;
    }
  });

  class UploadError extends Error {
    stage: 'prepare' | 'network' | 'storage' | 'register' | 'server';

    constructor(
      stage: 'prepare' | 'network' | 'storage' | 'register' | 'server',
      message: string
    ) {
      super(message);
      this.name = 'UploadError';
      this.stage = stage;
    }
  }

  function contentTypeFor(file: File) {
    if (file.type) return file.type;
    if (/\.pdf$/i.test(file.name)) return 'application/pdf';
    return 'application/octet-stream';
  }

  async function readJson(response: Response) {
    return await response.json().catch(() => ({}));
  }

  async function uploadThroughPortal(file: File, contentType: string) {
    const form = new FormData();
    form.set('projectSlug', projectSlug);
    form.set('folderName', selectedFolderName.trim());
    form.set('documentKind', documentKind);
    form.set('file', file, file.name);

    const response = await fetch('/api/files/upload', {
      method: 'POST',
      body: form
    });
    const result = await readJson(response);
    if (!response.ok) throw new UploadError('server', result.error ?? 'Portal upload failed.');
    return result.warning ? `${file.name} uploaded. ${result.warning}` : `${file.name} uploaded.`;
  }

  async function uploadDirectToStorage(file: File, contentType: string) {
    const uploadUrlResponse = await fetch('/api/files/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectSlug,
        filename: file.name,
        sizeBytes: file.size,
        contentType,
        documentKind
      })
    });
    const uploadUrl = await readJson(uploadUrlResponse);
    if (!uploadUrlResponse.ok || typeof uploadUrl.url !== 'string' || typeof uploadUrl.key !== 'string') {
      throw new UploadError('prepare', uploadUrl.error ?? 'Could not prepare upload.');
    }

    let storageResponse: Response;
    try {
      storageResponse = await fetch(uploadUrl.url, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file
      });
    } catch (error) {
      throw new UploadError('network', error instanceof Error ? error.message : 'Storage upload failed.');
    }
    if (!storageResponse.ok) {
      const details = await storageResponse.text().catch(() => '');
      throw new UploadError('storage', `Storage upload failed (${storageResponse.status}): ${details || storageResponse.statusText}`);
    }

    const registerResponse = await fetch('/api/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectSlug,
        key: uploadUrl.key,
        name: file.name,
        sizeBytes: file.size,
        mimeType: contentType,
        folderName: selectedFolderName.trim(),
        documentKind,
        tags: [],
        uploadToken: uploadUrl.uploadToken
      })
    });
    const result = await readJson(registerResponse);
    if (!registerResponse.ok) throw new UploadError('register', result.error ?? 'Upload saved to storage, but portal registration failed.');
    return result.warning ? `${file.name} uploaded. ${result.warning}` : `${file.name} uploaded.`;
  }

  async function uploadOne(file: File) {
    const contentType = contentTypeFor(file);
    try {
      return await uploadDirectToStorage(file, contentType);
    } catch (error) {
      if (!(error instanceof UploadError) || (error.stage !== 'network' && error.stage !== 'storage')) throw error;
      if (file.size > portalFallbackLimitBytes) {
        throw new UploadError(
          error.stage,
          `${error.message} Direct storage uploads must be allowed for files over 4 MB. Check the Tigris bucket CORS settings and try again.`
        );
      }
      message = `Direct upload was blocked by the browser; finishing ${file.name} through the portal...`;
      return await uploadThroughPortal(file, contentType);
    }
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
