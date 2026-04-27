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

  async function uploadOne(file: File) {
    const form = new FormData();
    form.set('projectSlug', projectSlug);
    form.set('folderName', folderName);
    form.set('file', file);

    const response = await fetch('/api/files/upload', {
        method: 'POST',
        body: form
    });

    if (!response.ok) throw new Error((await response.json()).error ?? 'Upload failed.');
  }

  async function upload(files: File[]) {
    if (files.length === 0) return;
    uploading = true;
    message = '';

    try {
      for (const file of files) {
        message = `Uploading ${file.name}...`;
        await uploadOne(file);
      }
      message = files.length === 1 ? `${files[0].name} uploaded.` : `${files.length} files uploaded.`;
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
