<script lang="ts">
  import { enhance } from '$app/forms';
  import { Plus } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';

  let { data, form } = $props();
  let createOpen = $state(false);
</script>

<svelte:head>
  <title>Admin Projects | Pueblo Electric Project Portal</title>
</svelte:head>

<PageShell>
  <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
    <div>
      <p class="text-xs font-black uppercase tracking-[0.16em] text-pe-green-dark">Admin</p>
      <h1 class="mt-2 text-3xl font-black text-pe-body">Projects</h1>
    </div>
    <button class="btn btn-primary" type="button" onclick={() => (createOpen = !createOpen)}><Plus size={16} />New project</button>
  </div>

  {#if form?.error}<div class="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>{/if}

  {#if createOpen}
    <form class="panel mb-6 grid gap-4 rounded-xl p-5 md:grid-cols-2 xl:grid-cols-4" method="post" action="?/createProject" use:enhance>
      <div><label class="label" for="name">Project name</label><input id="name" class="field" name="name" required /></div>
      <div><label class="label" for="slug">Project number</label><input id="slug" class="field" name="slug" required /></div>
      <div><label class="label" for="customer">Customer</label><input id="customer" class="field" name="customer" required /></div>
      <div><label class="label" for="phase">Phase</label><select id="phase" class="field" name="phase"><option value="pre_con">Pre-Con</option><option value="design">Design</option><option value="construction">Construction</option><option value="closeout">Closeout</option></select></div>
      <div class="md:col-span-2"><label class="label" for="address">Address</label><input id="address" class="field" name="address" /></div>
      <div><label class="label" for="percent">Complete</label><input id="percent" class="field" name="percentComplete" type="number" min="0" max="100" value="0" /></div>
      <div><label class="label" for="milestoneDate">Milestone date</label><input id="milestoneDate" class="field" name="nextMilestoneDate" type="date" /></div>
      <div class="md:col-span-2 xl:col-span-3"><label class="label" for="milestone">Next milestone</label><input id="milestone" class="field" name="nextMilestone" /></div>
      <div class="flex items-end"><button class="btn btn-primary w-full" type="submit">Create</button></div>
    </form>
  {/if}

  <div class="table-shell">
    <table class="portal-table">
      <thead><tr><th>#</th><th>Name</th><th>Customer</th><th>Phase</th><th>Complete</th><th>Members</th><th></th></tr></thead>
      <tbody>
        {#each data.projects as project}
          <tr>
            <td class="font-black text-pe-body">#{project.slug}</td>
            <td class="font-semibold text-pe-body">{project.name}</td>
            <td class="text-pe-sub">{project.customer}</td>
            <td><StatusPill label={project.phase} /></td>
            <td class="text-pe-sub">{project.percentComplete}%</td>
            <td class="text-pe-sub">{project.memberCount}</td>
            <td><a class="text-sm font-bold text-pe-green-dark" href={`/projects/${project.slug}`}>Open</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</PageShell>
