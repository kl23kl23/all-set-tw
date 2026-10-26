<script lang="ts">
  import {
    activityDateKey,
    formatActivityTime,
    type ActivityItem,
  } from "@taiwan-fin-hub/shared";
  import { createMutation, useQueryClient } from "@tanstack/svelte-query";
  import type { InvoiceSellerPaymentsResponse } from "@taiwan-fin-hub/shared";
  import type { ApiClient } from "@/shared/api/client";
  import { queryKeys } from "@/shared/api/query-keys";
  import { formatCurrency } from "@/shared/format/financial";
  import { cashInvoiceSellers } from "../model/summary";
  import InvoiceLines from "./InvoiceLines.svelte";

  let {
    api,
    cashInvoices,
    cashInvoiceTotal,
    cardSellerInvoices,
    cashSpent,
    rates,
  }: {
    api: ApiClient;
    cashInvoices: ActivityItem[];
    cashInvoiceTotal: number;
    cardSellerInvoices: ActivityItem[];
    /** Cash withdrawn and 全盈 debits in the period. */
    cashSpent: number;
    rates: Record<string, number>;
  } = $props();

  const qc = useQueryClient();
  const sellers = $derived(cashInvoiceSellers(cashInvoices, rates));
  const cardSellers = $derived(cashInvoiceSellers(cardSellerInvoices, rates));
  const setCardSeller = createMutation(() => ({
    mutationFn: (input: { sellerName: string; card: boolean }) =>
      api.put<InvoiceSellerPaymentsResponse>(
        "/api/invoice-seller-payments",
        input,
      ),
    onSuccess: (data) => qc.setQueryData(queryKeys.invoiceSellerPayments, data),
  }));
  let openInvoice = $state<string | null>(null);

  function shortDate(item: ActivityItem) {
    const date = activityDateKey(item);
    const time = item.dateHasTime ? ` ${formatActivityTime(item)}` : "";
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}${time}`;
  }
</script>

<section class="min-w-0 border-t border-ink/10 pt-5" aria-label="現金花在哪裡">
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-base font-semibold">現金花在哪裡</h2>
    <span class="text-caption tabular-nums text-subtle"
      >本期現金 {formatCurrency(cashSpent)}</span
    >
  </div>
  <p class="mt-1 text-caption text-subtle">
    沒配對到刷卡的發票視為現金購買，用來說明現金去向，不另外算開銷。點店家看每張發票，點發票看品項；其實是刷卡的店家按「通常刷卡」移出
  </p>
  {#if sellers.length === 0}
    <p class="mt-3 text-sm text-subtle">本期沒有未配對的發票。</p>
  {:else}
    <p class="mt-3 text-sm tabular-nums">
      有發票的 {formatCurrency(cashInvoiceTotal)}（{cashInvoices.length} 張）{cashSpent >
        0 && cashInvoiceTotal <= cashSpent
        ? `，約佔現金 ${Math.round((cashInvoiceTotal / cashSpent) * 100)}%`
        : ""}
    </p>
    {#if cashInvoiceTotal > cashSpent}
      <p class="mt-1 text-caption text-coral">
        比本期現金多 {formatCurrency(
          cashInvoiceTotal - cashSpent,
        )}，可能有刷卡資料還沒進來，或是上期領的現金
      </p>
    {/if}
    <ul class="mt-2 divide-y divide-ink/5">
      {#each sellers as seller (seller.seller)}
        <li>
          <details class="group py-2">
            <summary
              class="flex cursor-pointer list-none items-baseline justify-between gap-3"
            >
              <span class="min-w-0 truncate text-sm"
                ><span
                  class="mr-1 inline-block text-subtle group-open:rotate-90"
                  >›</span
                >{seller.seller}
                <span class="text-caption text-subtle">{seller.count} 張</span
                ></span
              >
              <span class="shrink-0 text-sm font-semibold tabular-nums"
                >{formatCurrency(seller.amount)}</span
              >
            </summary>
            <div class="mt-2 border-l-2 border-ink/10 pl-3">
              <ul>
                {#each seller.invoices as invoice (invoice.id)}
                  <li>
                    <button
                      class="flex w-full items-baseline justify-between gap-3 py-1 text-left text-caption"
                      aria-expanded={openInvoice === invoice.id}
                      onclick={() =>
                        (openInvoice =
                          openInvoice === invoice.id ? null : invoice.id)}
                    >
                      <span class="tabular-nums text-subtle"
                        >{shortDate(invoice)}</span
                      >
                      <span class="font-medium tabular-nums"
                        >{formatCurrency(Math.abs(invoice.amount ?? 0))}</span
                      >
                    </button>
                    {#if openInvoice === invoice.id}
                      <div class="pb-1 pl-2">
                        <InvoiceLines {api} invoiceId={invoice.id} />
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
              <button
                class="mt-2 rounded-md border border-ink/15 px-3 py-1.5 text-caption font-semibold text-steel disabled:opacity-50"
                disabled={setCardSeller.isPending}
                onclick={() =>
                  setCardSeller.mutate({
                    sellerName: seller.seller,
                    card: true,
                  })}>這家通常刷卡</button
              >
            </div>
          </details>
        </li>
      {/each}
    </ul>
  {/if}
  {#if cardSellers.length > 0}
    <details class="mt-3">
      <summary class="cursor-pointer text-caption font-semibold text-steel"
        >已設為通常刷卡的店家（本期 {cardSellers.length} 家）</summary
      >
      <ul class="divide-y divide-ink/5">
        {#each cardSellers as seller (seller.seller)}
          <li class="flex items-center justify-between gap-3 py-2">
            <span class="min-w-0 truncate text-sm text-subtle"
              >{seller.seller}
              <span class="text-caption"
                >{seller.count} 張 · {formatCurrency(seller.amount)}</span
              ></span
            >
            <button
              class="shrink-0 text-caption font-semibold text-steel disabled:opacity-50"
              disabled={setCardSeller.isPending}
              onclick={() =>
                setCardSeller.mutate({
                  sellerName: seller.seller,
                  card: false,
                })}>取消</button
            >
          </li>
        {/each}
      </ul>
    </details>
  {/if}
  {#if setCardSeller.isError}
    <p role="alert" class="mt-2 text-caption text-coral">
      設定失敗，請再試一次
    </p>
  {/if}
</section>
