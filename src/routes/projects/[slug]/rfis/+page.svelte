<script lang="ts">
  import { enhance } from '$app/forms';
  import { ArrowRight, Check, MessageSquarePlus, PencilLine, Search, X } from '@lucide/svelte';
  import AttachmentChips from '$lib/components/AttachmentChips.svelte';
  import AttachmentFields from '$lib/components/AttachmentFields.svelte';
  import PageShell from '$lib/components/PageShell.svelte';
  import StatusPill from '$lib/components/StatusPill.svelte';
  import { formatDate } from '$lib/utils';

  type PortalRfi = {
    id?: string;
    number: string;
    title?: string | null;
    question: string;
    suggestedSolution?: string | null;
    reference?: string | null;
    dueDate?: string | null;
    assignedTo?: string | null;
    assignedToId?: string | null;
    assignedOrg?: string | null;
    rfiManager?: string | null;
    rfiManagerId?: string | null;
    status: string;
    answer?: string | null;
    distribution?: string[];
    distributionIds?: string[];
    activity?: { at: string; by: string; type: string; note: string }[];
    attachments?: { id?: string; name: string; size: string; type: string; path?: string }[];
  };

  let { data, form } = $props();
  let showRfiForm = $state(false);
  let activeRfi = $state('');
  let query = $state('');
  let savedView = $state('all');
  let responseStatus = $state('answered');
  const canCreateCommunication = $derived(data.communicationAccess?.canCreate ?? true);
  const canReviewCommunication = $derived(data.communicationAccess?.canReview ?? true);
  const canAttachFiles = $derived(data.communicationAccess?.canAttachFiles ?? true);
  const openCount = $derived(data.rfis.filter((item) => item.status === 'Open').length);
  const answeredCount = $derived(data.rfis.filter((item) => item.status === 'Answered').length);
  const closedCount = $derived(data.rfis.filter((item) => item.status === 'Closed').length);
  const ballCount = $derived(data.rfis.filter((item) => item.assignedTo).length);

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

  const selectedRfi = $derived(data.rfis.find((item) => (item.id ?? item.number) === activeRfi));

  $effect(() => {
    if (selectedRfi) responseStatus = selectedRfi.status === 'Closed' ? 'closed' : selectedRfi.status === 'Answered' ? 'answered' : 'open';
  });

  function clearFilters() {
    query = '';
    savedView = 'all';
  }

  function rfiKey(rfi: PortalRfi) {
    return rfi.id ?? rfi.number;
  }

  function openRfiModal(rfi: PortalRfi) {
    activeRfi = rfiKey(rfi);
  }

  function openRfiButton(event: MouseEvent, rfi: PortalRfi) {
    event.stopPropagation();
    openRfiModal(rfi);
  }

  function closeRfiModal() {
    activeRfi = '';
  }

  function stopModalClick(event: MouseEvent) {
    event.stopPropagation();
  }

  function handleModalKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selectedRfi) closeRfiModal();
  }
</script>

<svelte:head>
  <title>RFIs | {data.project?.title}</title>
</svelte:head>

<svelte:window onkeydown={handleModalKeydown} />

<PageShell wide>
  <section class="tool-heading">
    <div class="min-w-0">
      <h1>RFIs</h1>
      <p>Create, distribute, answer, and close RFIs in their own tracking log.</p>
      <div class="tool-tabs" aria-label="RFI sections">
        <button class:active={savedView === 'all'} type="button" onclick={() => (savedView = 'all')}>Items</button>
        <button class:active={savedView === 'ball'} type="button" onclick={() => (savedView = 'ball')}>Ball In Court</button>
        <button class:active={savedView === 'open'} type="button" onclick={() => (savedView = 'open')}>Open</button>
        <button class:active={savedView === 'answered'} type="button" onclick={() => (savedView = 'answered')}>Answered</button>
        <button class:active={savedView === 'closed'} type="button" onclick={() => (savedView = 'closed')}>Closed</button>
      </div>
    </div>
    {#if canCreateCommunication}
      <div class="tool-actions">
        <button class="btn btn-primary" type="button" onclick={() => (showRfiForm = !showRfiForm)}>
          {#if showRfiForm}<X size={16} />Close form{:else}<MessageSquarePlus size={16} />New RFI{/if}
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

  <section class="workbench workflow-workbench">
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
          <option value="open">Open ({openCount})</option>
          <option value="answered">Answered ({answeredCount})</option>
          <option value="closed">Closed ({closedCount})</option>
          <option value="ball">Ball in Court ({ballCount})</option>
        </select>
        <span class="result-count">{filteredRfis.length} shown</span>
      </div>

      <div class="dense-table-shell">
        <table class="dense-table workflow-table">
          <thead>
            <tr>
              <th>RFI</th>
              <th>Status</th>
              <th>Ball In Court</th>
              <th>RFI Manager</th>
              <th>Reference</th>
              <th>Files</th>
              <th>Due Date</th>
              <th>Response</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {#each filteredRfis as rfi}
              <tr class:active-row={(selectedRfi?.id ?? selectedRfi?.number) === (rfi.id ?? rfi.number)} onclick={() => openRfiModal(rfi)}>
                <td>
                  <button class="record-button" type="button" onclick={(event) => openRfiButton(event, rfi)} aria-label={`Open ${rfi.number}`}>
                    <span>{rfi.number}</span>
                    <strong>{rfi.title || rfi.question}</strong>
                  </button>
                </td>
                <td><StatusPill label={rfi.status} /></td>
                <td>{rfi.assignedTo || 'Unassigned'}</td>
                <td>{rfi.rfiManager || 'Unassigned'}</td>
                <td>{rfi.reference || '-'}</td>
                <td>{rfi.attachments?.length ?? 0}</td>
                <td>{formatDate(rfi.dueDate)}</td>
                <td>{rfi.answer || '-'}</td>
                <td>
                  <button class="mini-button row-open-button" type="button" onclick={(event) => openRfiButton(event, rfi)}>
                    Open
                    <ArrowRight size={13} />
                  </button>
                </td>
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

{#if selectedRfi}
  <div class="modal-backdrop" role="presentation" onclick={closeRfiModal}>
      <div class="workflow-modal" role="dialog" aria-modal="true" aria-labelledby="rfi-modal-title" tabindex="-1" onclick={stopModalClick} onkeydown={handleModalKeydown}>
        <header class="modal-header">
          <div>
            <span class="eyebrow">RFI response</span>
            <h2 id="rfi-modal-title">{selectedRfi.number} {selectedRfi.title || selectedRfi.question}</h2>
          </div>
          <div class="modal-header-actions">
            <StatusPill label={selectedRfi.status} />
            <button class="icon-row-button" type="button" aria-label="Close RFI" onclick={closeRfiModal}>
              <X size={17} />
            </button>
          </div>
        </header>

        <div class="modal-body">
          <div class="rfi-facts">
            <div>
              <span>Ball in court</span>
              <strong>{selectedRfi.assignedTo || 'Unassigned'}</strong>
            </div>
            <div>
              <span>Manager</span>
              <strong>{selectedRfi.rfiManager || 'Unassigned'}</strong>
            </div>
            <div>
              <span>Due date</span>
              <strong>{formatDate(selectedRfi.dueDate)}</strong>
            </div>
            <div>
              <span>Reference</span>
              <strong>{selectedRfi.reference || '-'}</strong>
            </div>
            <div>
              <span>Org</span>
              <strong>{selectedRfi.assignedOrg || '-'}</strong>
            </div>
            <div>
              <span>Distribution</span>
              <strong>{selectedRfi.distribution?.length ? selectedRfi.distribution.join(', ') : 'None'}</strong>
            </div>
          </div>

          <div class="rfi-prompt-grid">
            <div>
              <span class="eyebrow">Question</span>
              <p class="tracking-question">{selectedRfi.question}</p>
            </div>
            {#if selectedRfi.suggestedSolution}
              <div>
                <span class="eyebrow">Suggested solution</span>
                <p class="tracking-question">{selectedRfi.suggestedSolution}</p>
              </div>
            {/if}
            {#if selectedRfi.answer}
              <div>
                <span class="eyebrow">Current response</span>
                <p class="tracking-question">{selectedRfi.answer}</p>
              </div>
            {/if}
          </div>

          <div class="item-attachments">
            <span class="eyebrow">Current attachments</span>
            <AttachmentChips
              attachments={selectedRfi.attachments ?? []}
              emptyLabel="No files attached to this RFI yet."
              downloadAllHref={selectedRfi.id
                ? `/api/projects/${encodeURIComponent(data.project?.id ?? '')}/attachments/rfi/${encodeURIComponent(selectedRfi.id)}/download`
                : ''}
            />
          </div>

          {#if selectedRfi.id && canReviewCommunication}
            <form class="modal-form rfi-modal-form" method="post" action="?/answerRfi" enctype="multipart/form-data" use:enhance>
              <input type="hidden" name="id" value={selectedRfi.id} />
              <label class="tracking-field">
                <span>Status</span>
                <select class="field" name="status" bind:value={responseStatus} aria-label="RFI status">
                  <option value="open">Open</option>
                  <option value="answered">Answered</option>
                  <option value="closed">Closed</option>
                </select>
              </label>
              <label class="tracking-field">
                <span>RFI manager</span>
                <select class="field" name="rfiManagerId" aria-label="RFI manager">
                  <option value="" disabled selected={!selectedRfi.rfiManagerId}>Select manager</option>
                  {#each data.directory as person}
                    <option value={person.id} selected={person.id === selectedRfi.rfiManagerId}>{person.name}</option>
                  {/each}
                </select>
              </label>
              <label class="tracking-field">
                <span>Ball in court</span>
                <select class="field" name="assignedTo" aria-label="Ball in Court">
                  <option value="">Unassigned</option>
                  {#each data.directory as person}
                    <option value={person.id} selected={person.id === selectedRfi.assignedToId}>{person.name}</option>
                  {/each}
                </select>
              </label>
              <label class="tracking-field">
                <span>Due</span>
                <input class="field" name="dueDate" type="date" value={selectedRfi.dueDate ?? ''} aria-label="Due date" />
              </label>
              <label class="tracking-field">
                <span>Org</span>
                <input class="field" name="assignedOrg" value={selectedRfi.assignedOrg ?? ''} placeholder="Org" aria-label="Assigned organization" />
              </label>
              <label class="tracking-field response-field">
                <span>Response</span>
                <textarea class="field min-h-28" name="answer" placeholder="Enter the RFI response, clarification, or status note">{selectedRfi.answer ?? ''}</textarea>
              </label>
              <label class="tracking-field distribution-field">
                <span>Distribution</span>
                <input type="hidden" name="distributionIds" value="" />
                <select class="field multi-select" name="distributionIds" multiple size={Math.min(5, Math.max(3, data.directory.length))} aria-label="RFI distribution list">
                  {#each data.directory.filter((person) => person.contactType !== 'external') as person}
                    <option value={person.id} selected={selectedRfi.distributionIds?.includes(person.id)}>{person.name}</option>
                  {/each}
                </select>
              </label>
              {#if canAttachFiles}
                <details class="modal-attachment-fields">
                  <summary>Attach or remove files</summary>
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
                </details>
              {/if}
              <div class="modal-footer">
                <button class="btn btn-secondary" type="button" onclick={closeRfiModal}>Cancel</button>
                <button class="btn btn-primary" type="submit"><PencilLine size={16} />Save response</button>
              </div>
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
        </div>
      </div>
  </div>
{/if}

<style>
  .workflow-workbench {
    grid-template-columns: minmax(0, 1fr);
  }

  .workflow-table {
    min-width: 0;
    table-layout: fixed;
  }

  .workflow-table th:nth-child(1),
  .workflow-table td:nth-child(1) {
    width: 25%;
  }

  .workflow-table th:nth-child(2),
  .workflow-table td:nth-child(2) {
    width: 9%;
  }

  .workflow-table th:nth-child(3),
  .workflow-table td:nth-child(3),
  .workflow-table th:nth-child(4),
  .workflow-table td:nth-child(4) {
    width: 12%;
  }

  .workflow-table th:nth-child(5),
  .workflow-table td:nth-child(5) {
    width: 13%;
  }

  .workflow-table th:nth-child(6),
  .workflow-table td:nth-child(6) {
    width: 5%;
  }

  .workflow-table th:nth-child(7),
  .workflow-table td:nth-child(7) {
    width: 8%;
  }

  .workflow-table th:nth-child(8),
  .workflow-table td:nth-child(8) {
    width: 10%;
  }

  .workflow-table th:nth-child(9),
  .workflow-table td:nth-child(9) {
    width: 6%;
  }

  .workflow-table td {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-button {
    display: grid;
    width: 100%;
    gap: 0.14rem;
    border: 0;
    background: transparent;
    padding: 0;
    color: inherit;
    text-align: left;
  }

  .record-button span {
    color: #1d5fb8;
    font-size: 0.78rem;
    font-weight: 850;
    text-decoration: underline;
  }

  .record-button strong {
    overflow: hidden;
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .record-button:hover strong {
    color: #164f9e;
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

  .row-open-button {
    gap: 0.25rem;
    white-space: nowrap;
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    display: grid;
    place-items: center;
    background: rgba(15, 17, 15, 0.38);
    padding: 1.25rem;
    backdrop-filter: blur(10px);
  }

  .workflow-modal {
    display: grid;
    width: min(1040px, 100%);
    max-height: min(92vh, 980px);
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.16);
    border-radius: 0.45rem;
    background: #fff;
    box-shadow: 0 28px 90px -42px rgba(0, 0, 0, 0.65);
  }

  .modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(25, 27, 25, 0.1);
    padding: 0.9rem 1rem;
  }

  .modal-header h2 {
    margin: 0.16rem 0 0;
    color: #191b19;
    font-size: 1.05rem;
    font-weight: 850;
    line-height: 1.25;
  }

  .modal-header-actions {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .modal-body {
    display: grid;
    gap: 0.9rem;
    overflow: auto;
    padding: 1rem;
  }

  .rfi-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    overflow: hidden;
    border: 1px solid rgba(25, 27, 25, 0.1);
    border-radius: 0.35rem;
    background: #fff;
  }

  .rfi-facts > div {
    display: grid;
    gap: 0.2rem;
    min-height: 3.25rem;
    border-right: 1px solid rgba(25, 27, 25, 0.08);
    border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    padding: 0.52rem 0.6rem;
  }

  .rfi-facts > div:nth-child(3n) {
    border-right: 0;
  }

  .rfi-facts > div:nth-last-child(-n + 3) {
    border-bottom: 0;
  }

  .rfi-facts span {
    color: #5c665d;
    font-size: 0.68rem;
    font-weight: 850;
    text-transform: uppercase;
  }

  .rfi-facts strong {
    overflow: hidden;
    color: #202520;
    font-size: 0.82rem;
    font-weight: 800;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .rfi-prompt-grid {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .modal-form {
    display: grid;
    grid-template-columns: minmax(9rem, 11rem) minmax(12rem, 1fr) minmax(12rem, 1fr) minmax(9rem, 11rem) minmax(8rem, 10rem);
    gap: 0.65rem;
    border-top: 1px solid rgba(25, 27, 25, 0.1);
    padding-top: 0.85rem;
  }

  .response-field,
  .distribution-field,
  .modal-attachment-fields,
  .modal-footer {
    grid-column: 1 / -1;
  }

  .modal-attachment-fields {
    min-width: 0;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.45rem;
  }

  .modal-attachment-fields summary {
    width: fit-content;
    color: #191b19;
    font-size: 0.82rem;
    font-weight: 850;
  }

  .modal-attachment-fields[open] summary {
    margin-bottom: 0.6rem;
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.55rem;
    border-top: 1px solid rgba(25, 27, 25, 0.08);
    padding-top: 0.8rem;
  }

  @media (max-width: 900px) {
    .workflow-workbench {
      grid-template-columns: 1fr;
    }

    .workflow-table {
      min-width: 920px;
    }

    .rfi-prompt-grid,
    .modal-form {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .modal-backdrop {
      align-items: end;
      padding: 0;
    }

    .workflow-modal {
      width: 100%;
      max-height: 92vh;
      border-radius: 0.45rem 0.45rem 0 0;
    }

    .modal-header {
      align-items: flex-start;
      padding: 0.8rem;
    }

    .modal-body {
      padding: 0.8rem;
    }

    .modal-footer {
      display: grid;
    }

    .rfi-facts {
      grid-template-columns: 1fr;
    }

    .rfi-facts > div,
    .rfi-facts > div:nth-child(3n),
    .rfi-facts > div:nth-last-child(-n + 3) {
      border-right: 0;
      border-bottom: 1px solid rgba(25, 27, 25, 0.08);
    }

    .rfi-facts > div:last-child {
      border-bottom: 0;
    }
  }
</style>
