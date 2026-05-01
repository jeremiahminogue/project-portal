<script lang="ts">
  import { enhance } from '$app/forms';
  import { Pencil, Plus, Trash2, Users } from '@lucide/svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';

  let { data, form } = $props();
  let createOpen = $state(false);
  let editId = $state('');
  let deleteId = $state('');
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
            <td>
              <div class="flex flex-wrap items-center gap-2">
                <a class="text-sm font-bold text-pe-green-dark" href={`/projects/${project.slug}`}>Open</a>
                <a class="inline-flex items-center gap-1 text-sm font-bold text-pe-sub" href={`/projects/${project.slug}/members`}><Users size={14} />Members</a>
                <button class="inline-flex items-center gap-1 text-sm font-bold text-pe-sub" type="button" onclick={() => (editId = editId === project.id ? '' : project.id)}>
                  <Pencil size={14} />Edit
                </button>
                <button class="inline-flex items-center gap-1 text-sm font-bold text-red-700" type="button" onclick={() => (deleteId = deleteId === project.id ? '' : project.id)}>
                  <Trash2 size={14} />Delete
                </button>
              </div>
            </td>
          </tr>
          {#if editId === project.id}
            <tr>
              <td colspan="7">
                <form class="grid gap-3 rounded-lg border border-black/10 bg-white p-4 md:grid-cols-2 xl:grid-cols-4" method="post" action="?/updateProject" use:enhance>
                  <input type="hidden" name="id" value={project.id} />
                  <div><label class="label" for={`edit-name-${project.id}`}>Project name</label><input id={`edit-name-${project.id}`} class="field" name="name" value={project.name} required /></div>
                  <div><label class="label" for={`edit-slug-${project.id}`}>Project number</label><input id={`edit-slug-${project.id}`} class="field" name="slug" value={project.slug} required /></div>
                  <div><label class="label" for={`edit-customer-${project.id}`}>Customer</label><input id={`edit-customer-${project.id}`} class="field" name="customer" value={project.customer} required /></div>
                  <div><label class="label" for={`edit-phase-${project.id}`}>Phase</label><select id={`edit-phase-${project.id}`} class="field" name="phase"><option value="pre_con" selected={project.phase === 'pre_con'}>Pre-Con</option><option value="design" selected={project.phase === 'design'}>Design</option><option value="construction" selected={project.phase === 'construction'}>Construction</option><option value="closeout" selected={project.phase === 'closeout'}>Closeout</option></select></div>
                  <div class="md:col-span-2"><label class="label" for={`edit-address-${project.id}`}>Address</label><input id={`edit-address-${project.id}`} class="field" name="address" value={project.address ?? ''} /></div>
                  <div><label class="label" for={`edit-percent-${project.id}`}>Complete</label><input id={`edit-percent-${project.id}`} class="field" name="percentComplete" type="number" min="0" max="100" value={project.percentComplete} /></div>
                  <div class="flex items-end"><button class="btn btn-primary w-full" type="submit">Save project</button></div>
                </form>
              </td>
            </tr>
          {/if}
          {#if deleteId === project.id}
            <tr>
              <td colspan="7">
                <form class="grid gap-3 rounded-lg border border-red-200 bg-red-50 p-4 md:grid-cols-[minmax(0,1fr)_auto]" method="post" action="?/deleteProject" use:enhance>
                  <input type="hidden" name="id" value={project.id} />
                  <input type="hidden" name="slug" value={project.slug} />
                  <div>
                    <label class="label text-red-800" for={`delete-${project.id}`}>Type {project.slug} to delete this project and its project data</label>
                    <input id={`delete-${project.id}`} class="field border-red-200" name="confirmSlug" autocomplete="off" />
                  </div>
                  <div class="flex items-end"><button class="btn bg-red-700 text-white hover:bg-red-800" type="submit">Delete</button></div>
                </form>
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
</PageShell>
