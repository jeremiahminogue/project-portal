<script lang="ts">
  import { FolderKanban, Users } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
</script>

<svelte:head>
  <title>Admin | Pueblo Electric Project Portal</title>
</svelte:head>

<PageShell>
  <div class="mb-6">
    <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Admin</p>
    <h1 class="mt-2 text-3xl font-black text-pe-body">Portal console</h1>
    <p class="mt-2 text-sm leading-6 text-pe-sub">Manage projects, clients, reviewers, and project access.</p>
  </div>

  <section class="grid gap-5 md:grid-cols-2">
    <a class="panel lift rounded-xl p-6" href="/admin/projects">
      <FolderKanban class="text-pe-green" size={28} />
      <div class="mt-5 text-4xl font-black text-pe-body">Projects</div>
      <p class="mt-2 text-sm leading-6 text-pe-sub">Create jobs, update phase and progress, and maintain project access.</p>
    </a>
    <a class="panel lift rounded-xl p-6" href="/admin/users">
      <Users class="text-pe-green" size={28} />
      <div class="mt-5 text-4xl font-black text-pe-body">Users</div>
      <p class="mt-2 text-sm leading-6 text-pe-sub">Create portal users, confirm access, and assign them to projects.</p>
    </a>
  </section>
</PageShell>
