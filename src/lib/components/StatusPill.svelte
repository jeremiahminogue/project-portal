<script lang="ts">
  import { statusTone } from '$lib/utils';

  let { label }: { label: string } = $props();
  const tone = $derived(statusTone(label));
</script>

<span class={`status ${tone}`}>{label}</span>

<style>
  .status {
    display: inline-flex;
    align-items: center;
    min-height: 1.45rem;
    border-radius: 999px;
    padding: 0.25rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 800;
    line-height: 1;
    white-space: nowrap;
  }

  .green {
    color: #147a31;
    background: rgba(29, 175, 63, 0.13);
  }

  .amber {
    color: #946116;
    background: rgba(245, 158, 11, 0.16);
  }

  .red {
    color: #a83333;
    background: rgba(220, 38, 38, 0.12);
  }

  .blue {
    color: #255b96;
    background: rgba(37, 99, 235, 0.12);
  }

  .gray,
  .neutral {
    color: #5f665f;
    background: rgba(91, 99, 91, 0.12);
  }
</style>
