<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { UploadCloud } from '@lucide/svelte';

  let {
    projectSlug,
    folderName = '',
    fullWidth = false
  }: { projectSlug: string; folderName?: string; fullWidth?: boolean } = $props();
  let input: HTMLInputElement;
  let uploading = $state(false);
  let message = $state('');

  function contentTypeFor(file: File) {
    if (file.type) return file.type;
    if (/\.pdf$/i.test(file.name)) return 'application/pdf';
    return 'application/octet-stream';
  }

  async function readJson(response: Response) {
    return await response.json().catch(() => ({}));
  }

  async function uploadOne(file: File) {
    const contentType = contentTypeFor(file);
    const uploadUrlResponse = await fetch('/api/files/upload-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectSlug,
        filename: file.name,
        sizeBytes: file.size,
        contentType
      })
    });
    const uploadUrl = await readJson(uploadUrlResponse);
    if (!uploadUrlResponse.ok || typeof uploadUrl.url !== 'string' || typeof uploadUrl.key !== 'string') {
      throw new Error(uploadUrl.error ?? 'Could not prepare upload.');
    }

    const storageResponse = await fetch(uploadUrl.url, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file
    });
    if (!storageResponse.ok) {
      const details = await storageResponse.text().catch(() => '');
      throw new Error(details || `Storage upload failed with status ${storageResponse.status}.`);
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
        folderName,
        tags: []
      })
    });
    const result = await readJson(registerResponse);
    if (!registerResponse.ok) throw new Error(result.error ?? 'Upload saved to storage, but portal registration failed.');
    return `${file.name} uploaded.`;
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

<div class={`flex flex-col gap-1 ${fullWidth ? 'items-stretch' : 'items-end'}`}>
  <input bind:this={input} class="sr-only" type="file" multiple onchange={onChange} />
  <button class={`btn btn-primary ${fullWidth ? 'w-full' : ''}`} type="button" disabled={uploading} onclick={() => input?.click()}>
    <UploadCloud size={16} />
    {uploading ? 'Uploading...' : 'Upload files'}
  </button>
  {#if message}
    <p class={`max-w-64 text-xs font-semibold text-pe-sub ${fullWidth ? 'text-left' : 'text-right'}`}>{message}</p>
  {/if}
</div>
