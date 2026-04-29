<script lang="ts">
  import { enhance } from '$app/forms';
  import { Check, MessageSquarePlus, PencilLine, Search, X } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  let { data, form } = $props();
  let showRfiForm = $state(false);
  let activeRfi = $state('');
  let query = $state('');
  let savedView = $state('all');
  let responseStatus = $state('answered');
  const canCreateCommunication = $derived(data.communicationAccess?.canCreate ?? true);
  const canReviewCommunication = $derived(data.communicationAccess?.canReview ?? true);
  const canAttachFiles = $derived(data.communicationAccess?.canAttachFiles ?? true);

  const filteredRfis = $derived(
    data.rfis.filter((item) => {
      const queryOk =
        !query ||
        `${item.number} ${item.title ?? ''} ${item.question} ${item.suggestedSolution ?? ''} ${item.reference ?? ''} ${item.rfiManager ?? ''} ${item.assignedTo} ${item.assignedOrg}`
          .toLowerCase()
          .includes(query.toLowerCase());
      const viewOk =
        savedView === 'all' ||
        (savedView === 'open' && item.status === 'Open') ||
        (savedView === 'answered' && item.status === 'Answered') ||
        (savedView === 'closed' && item.status === 'Closed') ||
        (savedView === 'ball' && item.assignedTo);
      return queryOk && viewOk;
    })
  );

  const selectedRfi = $derived(filteredRfis.find((item) => (item.id ?? item.number) === activeRfi) ?? filteredRfis[0] ?? data.rfis[0]);

  $effect(() => {
    if (!selectedRfi) {
      activeRfi = '';
      return;
    }

    const id = selectedRfi.id ?? selectedRfi.number;
    if (activeRfi !== id) activeRfi = id;
    responseStatus = selectedRfi.status === 'Closed' ? 'closed' : selectedRfi.status === 'Answered' ? 'answered' : 'open';
  });

  function clearFilters() {
    query = '';
    savedView = 'all';
  }
</script>

<svelte:head>
  <title>RFIs | {data.project?.title}</title>
</svelte:head>

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>RFIs</h1>
      <p>Create, distribute, answer, and close RFIs in their own tracking log.</p>
      <div class="tool-tabs" aria-label="RFI sections">
        <button class:active={savedView === 'all'} type="button" onclick={() => (savedView = 'all')}>Items</button>
        <button class:active={savedView === 'ball'} type="button" onclick={() => (savedView = 'ball')}>Ball In Court</button>
        <button class:active={savedView === 'answered'} type="button" onclick={() => (savedView = 'answered')}>Answered</button>
        <button class:active={savedView === 'closed'} type="button" onclick={() => (savedView = 'closed')}>Closed</button>
      </div>
    </div>
    {#if canCreateCommunication}
      <div class="tool-actions">
        <button class="btn btn-primary" type="button" onclick={() => (showRfiForm = !showRfiForm)}>
          <MessageSquarePlus size={16} />
          New RFI
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

  {#if showRfiForm && canCreateCommunication}
    <form class="utility-panel mb-3 grid gap-4 md:grid-cols-2 xl:grid-cols-5" method="post" action="?/createRfi" enctype="multipart/form-data" use:enhance>
      <div><label class="label" for="rfi-number">Number</label><input id="rfi-number" class="field" name="number" placeholder="Auto" /></div>
      <div class="md:col-span-2"><label class="label" for="rfi-subject">Subject</label><input id="rfi-subject" class="field" name="subject" placeholder="Clarify fire alarm tie-in" required /></div>
      <div><label class="label" for="rfi-due">Due</label><input id="rfi-due" class="field" name="dueDate" type="date" /></div>
      <div><label class="label" for="rfi-assigned">Assign to</label><select id="rfi-assigned" class="field" name="assignedTo"><option value="">Unassigned</option>{#each data.directory as person}<option value={person.id}>{person.name}</option>{/each}</select></div>
      <div><label class="label" for="rfi-manager">RFI manager</label><select id="rfi-manager" class="field" name="rfiManagerId"><option value="">Default manager</option>{#each data.directory as person}<option value={person.id}>{person.name}</option>{/each}</select></div>
      <div><label class="label" for="rfi-org">Org</label><input id="rfi-org" class="field" name="assignedOrg" placeholder="Designer" /></div>
      <div class="md:col-span-2 xl:col-span-3"><label class="label" for="rfi-reference">Reference</label><input id="rfi-reference" class="field" name="reference" placeholder="Drawing, spec section, detail, room, or field condition" /></div>
      <div class="md:col-span-2 xl:col-span-5">
        <label class="label" for="rfi-distribution">Distribution</label>
        <input type="hidden" name="distributionIds" value="" />
        <select id="rfi-distribution" class="field multi-select" name="distributionIds" multiple size={Math.min(6, Math.max(3, data.directory.length))}>
          {#each data.directory.filter((person) => person.contactType !== 'external') as person}
            <option value={person.id}>{person.name} - {person.organization}</option>
          {/each}
        </select>
      </div>
      <div class="md:col-span-2 xl:col-span-5"><label class="label" for="rfi-question">Question</label><textarea id="rfi-question" class="field min-h-24" name="question" required></textarea></div>
      <div class="md:col-span-2 xl:col-span-4"><label class="label" for="rfi-solution">Suggested solution</label><textarea id="rfi-solution" class="field min-h-24" name="suggestedSolution"></textarea></div>
      {#if canAttachFiles}
        <div class="md:col-span-2 xl:col-span-5">
          <AttachmentFields files={data.files} idPrefix="new-rfi" uploadLabel="Upload RFI files" existingLabel="Attach existing project files" />
        </div>
      {/if}
      <div class="flex items-end"><button class="btn btn-primary w-full" type="submit"><Check size={16} />Create</button></div>
    </form>
  {/if}

  {#if selectedRfi}
    <section class="tracking-panel">
      <div class="tracking-summary">
        <div>
          <span class="eyebrow">Tracking</span>
          <h2>{selectedRfi.number} {selectedRfi.title || selectedRfi.question}</h2>
        </div>
        <StatusPill label={selectedRfi.status} />
        <span class="readonly-chip">Ball in court: {selectedRfi.assignedTo || 'Unassigned'}</span>
        <span class="readonly-chip">Manager: {selectedRfi.rfiManager || 'Unassigned'}</span>
        <span class="readonly-chip">Due {formatDate(selectedRfi.dueDate)}</span>
        <span class="readonly-chip">Distribution: {selectedRfi.distribution?.length ? selectedRfi.distribution.join(', ') : 'None'}</span>
      </div>
      <div class="rfi-detail-grid">
        <div>
          <span class="eyebrow">Question</span>
          <p class="tracking-question">{selectedRfi.question}</p>
        </div>
        {#if selectedRfi.suggestedSolution}
          <div>
            <span class="eyebrow">Suggested Solution</span>
            <p class="tracking-question">{selectedRfi.suggestedSolution}</p>
          </div>
        {/if}
        {#if selectedRfi.reference}
          <div>
            <span class="eyebrow">Reference</span>
            <p class="tracking-question">{selectedRfi.reference}</p>
          </div>
        {/if}
      </div>
      <div class="item-attachments">
        <span class="eyebrow">Attachments</span>
        <AttachmentChips
          attachments={selectedRfi.attachments ?? []}
          emptyLabel="No files attached to this RFI yet."
          downloadAllHref={selectedRfi.id
            ? `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/rfi/${encodeURIComponent(selectedRfi.id)}/download`
            : ''}
        />
      </div>
      {#if selectedRfi.id && canReviewCommunication}
        <form class="tracking-form" method="post" action="?/answerRfi" enctype="multipart/form-data" use:enhance>
          <input type="hidden" name="id" value={selectedRfi.id} />
          <label class="tracking-field">
            <span>Status</span>
            <select class="field compact" name="status" bind:value={responseStatus} aria-label="RFI status">
              <option value="open">Open</option>
              <option value="answered">Answered</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label class="tracking-field">
            <span>RFI manager</span>
            <select class="field compact" name="rfiManagerId" aria-label="RFI manager">
              <option value="" disabled selected={!selectedRfi.rfiManagerId}>Select manager</option>
              {#each data.directory as person}
                <option value={person.id} selected={person.id === selectedRfi.rfiManagerId}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label class="tracking-field">
            <span>Ball in court</span>
            <select class="field compact" name="assignedTo" aria-label="Ball in Court">
              <option value="">Unassigned</option>
              {#each data.directory as person}
                <option value={person.id} selected={person.id === selectedRfi.assignedToId}>{person.name}</option>
              {/each}
            </select>
          </label>
          <label class="tracking-field">
            <span>Due</span>
            <input class="field compact" name="dueDate" type="date" value={selectedRfi.dueDate ?? ''} aria-label="Due date" />
          </label>
          <label class="tracking-field">
            <span>Org</span>
            <input class="field compact" name="assignedOrg" value={selectedRfi.assignedOrg ?? ''} placeholder="Org" aria-label="Assigned organization" />
          </label>
          <label class="tracking-field rfi-answer-field">
            <span>Response</span>
            <input class="field rfi-answer" name="answer" value={selectedRfi.answer ?? ''} placeholder="Answer, response, or status note" />
          </label>
          {#if canAttachFiles}
            <div class="tracking-attachment-fields">
              {#if selectedRfi.attachments?.some((attachment) => attachment.id)}
                <fieldset class="remove-attachments">
                  <legend>Remove existing files</legend>
                  {#each selectedRfi.attachments.filter((attachment) => attachment.id) as attachment}
                    <label>
                      <input name="removeAttachmentIds" type="checkbox" value={attachment.id} />
                      <span>{attachment.name}</span>
                    </label>
                  {/each}
                </fieldset>
              {/if}
              <AttachmentFields
                files={data.files}
                idPrefix={`rfi-${selectedRfi.id}-attachments`}
                uploadLabel="Upload response files"
                existingLabel="Attach existing files"
              />
            </div>
          {/if}
          <label class="tracking-field distribution-field">
            <span>Distribution</span>
            <input type="hidden" name="distributionIds" value="" />
            <select class="field compact multi-select" name="distributionIds" multiple size={Math.min(5, Math.max(3, data.directory.length))} aria-label="RFI distribution list">
              {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                <option value={person.id} selected={selectedRfi.distributionIds?.includes(person.id)}>{person.name}</option>
              {/each}
            </select>
          </label>
          <button class="btn btn-primary" type="submit"><PencilLine size={16} />Save response</button>
        </form>
      {/if}
      {#if selectedRfi.activity?.length}
        <div class="activity-log">
          <span class="eyebrow">History</span>
          {#each selectedRfi.activity.slice().reverse() as item}
            <div>
              <strong>{item.type}</strong>
              <span>{formatDate(item.at)} by {item.by}</span>
              <p>{item.note}</p>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {/if}

  <section class="workbench workflow-workbench">
    <aside class="saved-views">
      <div class="views-title">Views</div>
      <button class={`view-row ${savedView === 'all' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'all')}>
        <span>All RFIs</span>
        <strong>{data.rfis.length}</strong>
      </button>
      <button class={`view-row ${savedView === 'open' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'open')}>
        <span>Open</span>
        <strong>{data.rfis.filter((item) => item.status === 'Open').length}</strong>
      </button>
      <button class={`view-row ${savedView === 'closed' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'closed')}>
        <span>Closed</span>
        <strong>{data.rfis.filter((item) => item.status === 'Closed').length}</strong>
      </button>
      <button class={`view-row ${savedView === 'answered' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'answered')}>
        <span>Answered</span>
        <strong>{data.rfis.filter((item) => item.status === 'Answered').length}</strong>
      </button>
      <button class={`view-row ${savedView === 'ball' ? 'active' : ''}`} type="button" onclick={() => (savedView = 'ball')}>
        <span>Ball in Court</span>
        <strong>{data.rfis.filter((item) => item.assignedTo).length}</strong>
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
          <option value="answered">Answered</option>
          <option value="closed">Closed</option>
          <option value="ball">Ball in Court</option>
        </select>
        <span class="result-count">{filteredRfis.length} shown</span>
      </div>

      <div class="dense-table-shell">
        <table class="dense-table workflow-table">
          <thead>
            <tr>
              <th>Track</th>
              <th>Number</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Reference</th>
              <th>RFI Manager</th>
              <th>Ball In Court</th>
              <th>Files</th>
              <th>Due Date</th>
            </tr>
          </thead>
          <tbody>
            {#each filteredRfis as rfi}
              <tr class:active-row={(selectedRfi?.id ?? selectedRfi?.number) === (rfi.id ?? rfi.number)} onclick={() => (activeRfi = rfi.id ?? rfi.number)}>
                <td><button class="mini-button" type="button">Track</button></td>
                <td><span class="record-link">{rfi.number}</span></td>
                <td><span class="subject-link">{rfi.title || rfi.question}</span></td>
                <td><StatusPill label={rfi.status} /></td>
                <td>{rfi.reference || '-'}</td>
                <td>{rfi.rfiManager || 'Unassigned'}</td>
                <td>{rfi.assignedTo || 'Unassigned'}</td>
                <td>{rfi.attachments?.length ?? 0}</td>
                <td>{formatDate(rfi.dueDate)}</td>
              </tr>
            {:else}
              <tr><td colspan="9"><div class="empty-log"><strong>No RFIs match this view.</strong><span>Create an RFI or adjust the filters.</span></div></td></tr>
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
    min-width: 0;
    table-layout: fixed;
  }

  .workflow-table th:nth-child(1),
  .workflow-table td:nth-child(1) {
    width: 4.5rem;
  }

  .workflow-table th:nth-child(2),
  .workflow-table td:nth-child(2) {
    width: 6.5rem;
  }

  .workflow-table th:nth-child(4),
  .workflow-table td:nth-child(4) {
    width: 7.5rem;
  }

  .workflow-table th:nth-child(7),
  .workflow-table td:nth-child(7),
  .workflow-table th:nth-child(8),
  .workflow-table td:nth-child(8) {
    width: 8rem;
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

  .tracking-question {
    margin: 0.45rem 0 0;
    color: #303830;
    font-size: 0.82rem;
    line-height: 1.5;
  }

  .item-attachments {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.85rem;
  }

  .tracking-form {
    grid-template-columns: minmax(8rem, 10rem) minmax(10rem, 14rem) minmax(12rem, 16rem) minmax(9rem, 11rem) minmax(8rem, 12rem) minmax(16rem, 1fr) auto;
    align-items: end;
  }

  .tracking-attachment-fields {
    grid-column: 1 / -2;
    min-width: 0;
  }

  .distribution-field {
    grid-column: 1 / -2;
  }

  .multi-select {
    min-height: 6.2rem;
    padding-block: 0.4rem;
  }

  .multi-select option {
    padding: 0.22rem 0.2rem;
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

  .activity-log {
    display: grid;
    gap: 0.45rem;
    margin-top: 0.9rem;
  }

  .activity-log > div {
    border-left: 3px solid rgba(24, 165, 58, 0.35);
    background: rgba(255, 255, 255, 0.72);
    padding: 0.45rem 0.65rem;
  }

  .activity-log strong {
    color: #191b19;
    font-size: 0.78rem;
    font-weight: 850;
    text-transform: capitalize;
  }

  .activity-log span,
  .activity-log p {
    display: block;
    margin: 0.1rem 0 0;
    color: #4f594f;
    font-size: 0.74rem;
    line-height: 1.35;
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

  .filter-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .rfi-detail-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @media (max-width: 900px) {
    .workflow-workbench {
      grid-template-columns: 1fr;
    }

    .rfi-detail-grid {
      grid-template-columns: 1fr;
    }

    .tracking-form {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .tracking-form .rfi-answer-field,
    .tracking-form .tracking-attachment-fields,
    .tracking-form .btn {
      grid-column: span 2;
    }
  }

  @media (max-width: 640px) {
    .tracking-form {
      grid-template-columns: 1fr;
    }

    .tracking-form .rfi-answer-field,
    .tracking-form .tracking-attachment-fields,
    .tracking-form .btn {
      grid-column: auto;
      width: 100%;
    }
  }

  @media (max-width: 760px) {
    .workflow-table th:nth-child(4),
    .workflow-table td:nth-child(4) {
      display: none;
    }
  }
</style>
