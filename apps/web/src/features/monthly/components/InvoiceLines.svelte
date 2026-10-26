<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import type { ApiClient } from "@/shared/api/client";
  import { invoiceDetailQuery } from "@/data/invoices/queries";
  import { formatCurrency } from "@/shared/format/financial";

  /** Line items of one invoice, loaded when its row opens. */
  let { api, invoiceId }: { api: ApiClient; invoiceId: string } = $props();

  const detail = createQuery(() => invoiceDetailQuery(() => api, invoiceId));
</script>

{#if detail.isPending}
  <p class="py-1 text-caption text-subtle">載入品項中…</p>
{:else if detail.isError}
  <p class="py-1 text-caption text-coral">品項載入失敗</p>
{:else if !detail.data?.items.length}
  <p class="py-1 text-caption text-subtle">這張發票沒有品項明細</p>
{:else}
  <ul class="py-1">
    {#each detail.data.items as line (line.id)}
      <li
        class="flex items-baseline justify-between gap-3 text-caption text-subtle"
      >
        <span class="min-w-0 truncate"
          >{line.description}{line.quantity && line.quantity !== 1
            ? ` × ${line.quantity}`
            : ""}</span
        >
        <span class="shrink-0 tabular-nums">{formatCurrency(line.amount)}</span>
      </li>
    {/each}
  </ul>
{/if}
