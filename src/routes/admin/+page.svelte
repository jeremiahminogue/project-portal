<script lang="ts">
  import { FolderKanban, ScrollText, Users } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';

  let { data } = $props();
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

  <section class="mt-6">
    <div class="mb-3 flex items-center gap-2">
      <ScrollText class="text-pe-green" size={20} />
      <h2 class="text-lg font-black text-pe-body">Recent audit activity</h2>
    </div>
    <div class="table-shell">
      <table class="portal-table">
        <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th></tr></thead>
        <tbody>
          {#each data.auditLogs as log}
            <tr>
              <td class="text-pe-sub">{new Date(log.createdAt).toLocaleString()}</td>
              <td class="font-semibold text-pe-body">{log.actorEmail ?? 'System'}</td>
              <td class="text-pe-sub">{log.action}</td>
              <td class="text-pe-sub">{log.targetType}{log.targetId ? `: ${log.targetId}` : ''}</td>
            </tr>
          {:else}
            <tr><td colspan="4" class="text-pe-sub">No audit events recorded yet.</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </section>
</PageShell>
