<script lang="ts">
  import { enhance } from '$app/forms';
  import { Bell, Check, FilePlus2, PencilLine, Search, X } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data, form } = $props();
  let showSubmittalForm = $state(false);
  let activeSubmittal = $state('');
  let query = $state('');
  let savedView = $state('all');
  let decisionStatus = $state('in_review');
  const canCreateCommunication = $derived(data.communicationAccess?.canCreate ?? true);
  const canReviewCommunication = $derived(data.communicationAccess?.canReview ?? true);
  const canAttachFiles = $derived(data.communicationAccess?.canAttachFiles ?? true);

  const filteredSubmittals = $derived(
    data.submittals.filter((item) => {
      const queryOk = !query || `${item.number} ${item.title} ${item.specSection} ${item.owner}`.toLowerCase().includes(query.toLowerCase());
      const viewOk =
        savedView === 'all' ||
        (savedView === 'open' && !['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'closed' && ['Approved', 'Rejected'].includes(item.status)) ||
        (savedView === 'ball' && item.owner);
      return queryOk && viewOk;
    })
  );

  const selectedSubmittal = $derived(filteredSubmittals.find((item) => (item.id ?? item.number) === activeSubmittal) ?? filteredSubmittals[0] ?? data.submittals[0]);

  $effect(() => {
    if (!selectedSubmittal) {
      activeSubmittal = '';
      return;
    }

    const id = selectedSubmittal.id ?? selectedSubmittal.number;
    if (activeSubmittal !== id) activeSubmittal = id;
    decisionStatus = statusValue(selectedSubmittal.status);
  });

  function statusValue(label: string) {
    const statuses: Record<string, string> = {
      Draft: 'draft',
      Submitted: 'submitted',
      'In Review': 'in_review',
      Approved: 'approved',
      'Revise & Resubmit': 'revise_resubmit',
      Rejected: 'rejected'
    };
    return statuses[label] ?? 'in_review';
  }

  function clearFilters() {
    query = '';
    savedView = 'all';
  }
</script>

<svelte:head>
  <title>Submittals | {data.project?.title}</title>
</svelte:head>

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>Submittals</h1>
      <p>Create, assign, review, and track submittal packages without mixing them into the drawing log.</p>
      <div class="tool-tabs" aria-label="Submittal sections">
        <button class:active={savedView === 'all'} type="button" onclick={() => (savedView = 'all')}>Items</button>
        <button class:active={savedView === 'ball'} type="button" onclick={() => (savedView = 'ball')}>Ball In Court</button>
        <button class:active={savedView === 'open'} type="button" onclick={() => (savedView = 'open')}>Open</button>
        <button class:active={savedView === 'closed'} type="button" onclick={() => (savedView = 'closed')}>Closed</button>
      </div>
    </div>
    {#if canCreateCommunication}
      <div class="tool-actions">
        <button class="btn btn-primary" type="button" onclick={() => (showSubmittalForm = !showSubmittalForm)}>
          <FilePlus2 size={16} />
          New submittal
        </button>
      </div>
    {/if}
  </section>

  {#if form?.error}
    <div class="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{form.error}</div>
  {/if}
  {#if form?.ok}
    <div class="mb-3 rounded-md border border-pe-green/20 bg-pe-green/10 px-3 py-2 text-sm font-semibold text-pe-green-dark">Saved.</div>
  {/if}

  {#if showSubmittalForm && canCreateCommunication}
    <form class="utility-panel mb-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="post" action="?/createSubmittal" enctype="multipart/form-data" use:enhance>
      <div><label class="label" for="sub-number">Number</label><input id="sub-number" class="field" name="number" placeholder="1646-001" required /></div>
      <div class="xl:col-span-2"><label class="label" for="sub-title">Title</label><input id="sub-title" class="field" name="title" placeholder="Fire alarm panel shop drawings" required /></div>
      <div><label class="label" for="sub-spec">Spec section</label><input id="sub-spec" class="field" name="specSection" placeholder="28 31 00" /></div>
      <div><label class="label" for="sub-due">Final due</label><input id="sub-due" class="field" name="dueDate" type="date" /></div>
      <div><label class="label" for="sub-revision">Revision</label><input id="sub-revision" class="field" name="revision" type="number" min="0" value="0" /></div>
      <div><label class="label" for="sub-submit-by">Submit by</label><input id="sub-submit-by" class="field" name="submitBy" type="date" /></div>
      <div class="md:col-span-2"><label class="label" for="sub-owner">Assign to</label><select id="sub-owner" class="field" name="owner"><option value="">Unassigned</option>{#each data.directory as person}<option value={person.id}>{person.name} - {person.organization}</option>{/each}</select></div>
      <div class="md:col-span-2"><label class="label" for="sub-received-from">Received from</label><select id="sub-received-from" class="field" name="receivedFrom"><option value="">Not received</option>{#each data.directory.filter((person) => person.contactType !== 'external') as person}<option value={person.id}>{person.name} - {person.organization}</option>{/each}</select></div>
      <div class="md:col-span-2 xl:col-span-5">
        <label class="label" for="sub-routing">Workflow reviewers</label>
        <select id="sub-routing" class="field multi-select" name="routingAssigneeIds" multiple size={Math.min(6, Math.max(3, data.directory.length))}>
          {#each data.directory.filter((person) => person.contactType !== 'external') as person}
            <option value={person.id}>{person.name} - {person.organization}</option>
          {/each}
        </select>
      </div>
      <div class="md:col-span-2 xl:col-span-3"><label class="label" for="sub-notes">Notes</label><input id="sub-notes" class="field" name="notes" placeholder="Routing notes, upload reference, or decision context" /></div>
      {#if canAttachFiles}
        <div class="md:col-span-2 xl:col-span-5">
          <AttachmentFields files={data.files} idPrefix="new-submittal" uploadLabel="Upload submittal files" existingLabel="Attach existing project files" />
        </div>
      {/if}
      <label class="notify-check md:col-span-2 xl:col-span-4" for="sub-send-emails">
        <input id="sub-send-emails" name="sendEmails" type="checkbox" checked />
        <Bell size={15} />
        <span>Create and send workflow emails</span>
      </label>
      <div class="flex items-end"><button class="btn btn-primary w-full" type="submit"><Check size={16} />Create</button></div>
    </form>
  {/if}

  {#if selectedSubmittal}
    <section class="tracking-panel">
      <div class="tracking-summary">
        <div>
          <span class="eyebrow">Tracking</span>
          <h2>{selectedSubmittal.number} {selectedSubmittal.title}</h2>
        </div>
        <StatusPill label={selectedSubmittal.status} />
        <span class="readonly-chip">Rev. {selectedSubmittal.revision ?? 0}</span>
        <span class="readonly-chip">Ball in court: {selectedSubmittal.owner || 'Unassigned'}</span>
        <span class="readonly-chip">Received from: {selectedSubmittal.receivedFrom || '-'}</span>
        <span class="readonly-chip">Due {formatDate(selectedSubmittal.dueDate)}</span>
      </div>
      {#if selectedSubmittal.routingSteps?.length}
        <div class="routing-lane" aria-label="Submittal workflow">
          {#each selectedSubmittal.routingSteps as step}
            <div class:active-step={step.order === (selectedSubmittal.currentStep ?? 0)}>
              <strong>Step {step.order + 1}: {step.assignee}</strong>
              <span>{step.role} - {step.status} - Due {formatDate(step.dueDate)}</span>
              {#if step.response}<p>{step.response}</p>{/if}
            </div>
          {/each}
        </div>
      {/if}
      <div class="item-attachments">
        <span class="eyebrow">Attachments</span>
        <AttachmentChips
          attachments={selectedSubmittal.attachments ?? []}
          emptyLabel="No files attached to this submittal yet."
          downloadAllHref={selectedSubmittal.id
            ? `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/submittal/${encodeURIComponent(selectedSubmittal.id)}/download`
            : ''}
        />
      </div>
      {#if selectedSubmittal.id && canReviewCommunication}
        <form class="tracking-form" method="post" action="?/updateSubmittal" enctype="multipart/form-data" use:enhance>
          <input type="hidden" name="id" value={selectedSubmittal.id} />
          <label class="tracking-field">
            <span>Status</span>
            <select class="field compact" name="status" bind:value={decisionStatus} aria-label="Submittal decision">
              <option value="submitted">Submitted</option>
              <option value="in_review">In Review</option>
              <option value="approved">Approved</option>
              <option value="revise_resubmit">Revise & Resubmit</option>
              <option value="rejected">Rejected</option>
            </select>
          </label>
          <label class="tracking-field decision-field">
            <span>Decision note</span>
            <input class="field" name="decision" placeholder="Decision note or routing update" />
          </label>
          <label class="tracking-field">
            <span>Next ball in court</span>
            <select class="field compact" name="workflowAssigneeId" aria-label="Next workflow assignee">
              <option value="">Keep current</option>
              {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                <option value={person.id} selected={person.id === selectedSubmittal.ownerId}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label class="tracking-field">
            <span>Step due</span>
            <input class="field compact" name="stepDueDate" type="date" value={selectedSubmittal.dueDate ?? ''} />
          </label>
          <label class="notify-check compact-notify" for="sub-update-send-emails">
            <input id="sub-update-send-emails" name="sendEmails" type="checkbox" checked />
            <Bell size={15} />
            <span>Update and send workflow emails</span>
          </label>
          {#if canAttachFiles}
            <div class="tracking-attachment-fields">
              {#if selectedSubmittal.attachments?.some((attachment) => attachment.id)}
                <fieldset class="remove-attachments">
                  <legend>Remove existing files</legend>
                  {#each selectedSubmittal.attachments.filter((attachment) => attachment.id) as attachment}
                    <label>
                      <input name="removeAttachmentIds" type="checkbox" value={attachment.id} />
                      <span>{attachment.name}</span>
                    </label>
                  {/each}
                </fieldset>
              {/if}
              <AttachmentFields
                files={data.files}
                idPrefix={`submittal-${selectedSubmittal.id}-attachments`}
                uploadLabel="Upload tracking files"
                existingLabel="Attach existing files"
              />
            </div>
          {/if}
          <button class="btn btn-primary" type="submit"><PencilLine size={16} />Save tracking</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="workbench workflow-workbench">
    <aside class="saved-views">
      <div class="views-title">Views</div>
      <button class={`view-row ${savedView === 'all' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'all')}>
        <span>All Submittals</span>
        <strong>{data.submittals.length}</strong>
      </button>
      <button class={`view-row ${savedView === 'open' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'open')}>
        <span>Open</span>
        <strong>{data.submittals.filter((item) => !['Approved', 'Rejected'].includes(item.status)).length}</strong>
      </button>
      <button class={`view-row ${savedView === 'closed' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'closed')}>
        <span>Closed</span>
        <strong>{data.submittals.filter((item) => ['Approved', 'Rejected'].includes(item.status)).length}</strong>
      </button>
      <button class={`view-row ${savedView === 'ball' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'ball')}>
        <span>Ball in Court</span>
        <strong>{data.submittals.filter((item) => item.owner).length}</strong>
      </button>
    </aside>

    <div class="log-area">
      <div class="log-toolbar">
        <div class="searchbox">
          <Search size={16} />
          <input bind:value={query} placeholder="Search" />
        </div>
        <button class="filter-button" type="button" onclick={clearFilters} disabled={!query && savedView === 'all'} title="Clear filters">
          <X size={14} />
          Clear
        </button>
        <select class="field compact" aria-label="Status filter" bind:value={savedView}>
          <option value="all">All statuses</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="ball">Ball in Court</option>
        </select>
        <span class="result-count">{filteredSubmittals.length} shown</span>
      </div>

      <div class="dense-table-shell">
        <table class="dense-table workflow-table">
          <thead>
            <tr>
              <th>Track</th>
              <th>Spec Section</th>
              <th>#</th>
              <th>Rev.</th>
              <th>Title</th>
              <th>Status</th>
              <th>Responsible Contractor</th>
              <th>Submit By</th>
              <th>Received From</th>
              <th>Ball In Court</th>
              <th>Approvers</th>
              <th>Files</th>
              <th>Response</th>
              <th>Final Due</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredSubmittals as sub}
              <tr class:active-row={(selectedSubmittal?.id ?? selectedSubmittal?.number) === (sub.id ?? sub.number)} onclick={() => (activeSubmittal = sub.id ?? sub.number)}>
                <td><button class="mini-button" type="button">Track</button></td>
                <td>{sub.specSection || '-'}</td>
                <td><span class="record-link">{sub.number}</span></td>
                <td>{sub.revision ?? 0}</td>
                <td><span class="subject-link">{sub.title}</span></td>
                <td><StatusPill label={sub.status} /></td>
                <td>{sub.owner || 'Pueblo Electric'}</td>
                <td>{formatDate(sub.submitBy)}</td>
                <td>{sub.receivedFrom || '-'}</td>
                <td>{sub.owner || 'Unassigned'}</td>
                <td>{sub.routing.join(', ') || 'Not routed'}</td>
                <td>{sub.attachments?.length ?? 0}</td>
                <td>{sub.notes || '-'}</td>
                <td>{formatDate(sub.dueDate)}</td>
              </tr>
            {:else}
              <tr><td colspan="14"><div class="empty-log"><strong>No submittals match this view.</strong><span>Create a submittal or adjust the filters.</span></div></td></tr>
            {/each}
          </tbody>
        </table>
      </div>
    </div>
  </section>
</PageShell>

<style>
  .workflow-workbench {
    grid-template-columns: 230px minmax(0, 1fr);
  }

  .workflow-table {
    min-width: 1440px;
  }

  .subject-link {
    display: block;
    max-width: 18rem;
    overflow: hidden;
    color: #164f9e;
    font-weight: 750;
    text-overflow: ellipsis;
    text-decoration: underline;
    white-space: nowrap;
  }

  .tracking-form {
    grid-template-columns: minmax(10rem, 13rem) minmax(16rem, 1fr) minmax(12rem, 16rem) minmax(9rem, 11rem) auto;
    align-items: end;
  }

  .item-attachments {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.85rem;
  }

  .tracking-attachment-fields {
    grid-column: 1 / -2;
    min-width: 0;
  }

  .routing-lane {
    display: grid;
    gap: 0.5rem;
    margin-top: 0.85rem;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  }

  .routing-lane > div {
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-left: 3px solid rgba(105, 113, 105, 0.28);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.6rem;
  }

  .routing-lane > div.active-step {
    border-left-color: #18a53a;
    background: rgba(29, 175, 63, 0.07);
  }

  .routing-lane strong,
  .routing-lane span,
  .routing-lane p {
    display: block;
    margin: 0.1rem 0 0;
    color: #303830;
    font-size: 0.76rem;
    line-height: 1.35;
  }

  .routing-lane strong {
    color: #191b19;
    font-weight: 850;
  }

  .multi-select {
    min-height: 6.2rem;
    padding-block: 0.4rem;
  }

  .remove-attachments {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    margin: 0 0 0.55rem;
    border: 0;
    padding: 0;
  }

  .remove-attachments legend {
    width: 100%;
    color: #4f594f;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .remove-attachments label {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    border: 1px solid rgba(25, 27, 25, 0.12);
    border-radius: 0.35rem;
    background: #fff;
    padding: 0.38rem 0.5rem;
    color: #303830;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .tracking-form .btn {
    white-space: nowrap;
  }

  .tracking-field {
    display: grid;
    gap: 0.28rem;
    min-width: 0;
  }

  .tracking-field span {
    color: #4f594f;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .tracking-field .field {
    width: 100%;
  }

  .notify-check {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    color: #303630;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .notify-check input {
    width: 1rem;
    height: 1rem;
    accent-color: #191b19;
  }

  .compact-notify {
    white-space: nowrap;
    align-self: end;
    min-height: 2.35rem;
  }

  .filter-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  @media (max-width: 900px) {
    .workflow-workbench {
      grid-template-columns: 1fr;
    }

    .tracking-form {
      grid-template-columns: 1fr;
    }

    .tracking-attachment-fields {
      grid-column: auto;
    }

    .tracking-form .btn {
      width: 100%;
    }

    .compact-notify {
      white-space: normal;
    }
  }
</style>
