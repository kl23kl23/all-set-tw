<script lang="ts">
  import Button from "@/shared/ui/Button.svelte";
  import EmptyState from "@/shared/ui/EmptyState.svelte";
  import type { ApiClient } from "@/shared/api/client";
  import { formatCurrency } from "@/shared/format/financial";
  import { cardDisplayName, summarizeCards } from "./model/cards";
  import { createPeriodData } from "./model/period-data.svelte";
  import CreditCardSection from "./components/CreditCardSection.svelte";
  import PeriodPicker from "./components/PeriodPicker.svelte";
  import SpendingTable, {
    type SpendingFilter,
  } from "./components/SpendingTable.svelte";

  let { api }: { api: ApiClient } = $props();

  const data = createPeriodData(() => api);
  const { currentPeriod, periodKeys } = data;

  let selectedPeriod = $state(currentPeriod);
  let detailFilters = $state<Record<string, string>>({});

  const summary = $derived(data.summaries.get(selectedPeriod)!);
  const cards = $derived(
    summarizeCards(
      data.accounts,
      data.bills,
      summary.spending,
      data.accountOfTransaction,
      data.rates,
    ),
  );
  const cardItems = $derived(cards.flatMap((card) => card.periodItems));
  const periodSpend = $derived(
    cards.reduce((sum, card) => sum + card.periodSpend, 0),
  );
  const limited = $derived(cards.filter((card) => card.usage != null));
  const totalLimit = $derived(
    limited.reduce((sum, card) => sum + (card.limit ?? 0), 0),
  );
  const totalUsed = $derived(
    limited.reduce((sum, card) => sum + (card.used ?? 0), 0),
  );
  const unpaid = $derived(
    cards
      .map((card) => card.latestBill)
      .filter((bill) => bill && !bill.isPaid && (bill.statementAmount ?? 0) > 0)
      .map((bill) => ({
        amount: (bill!.statementAmount ?? 0) - (bill!.paidAmount ?? 0),
        due: bill!.paymentDueDate ?? "",
      }))
      .filter((bill) => bill.amount > 0),
  );
  const nextDue = $derived(
    unpaid
      .map((bill) => bill.due)
      .filter(Boolean)
      .sort()[0],
  );
  const cardNames = $derived(
    new Map(cards.map((card) => [card.account.id, cardDisplayName(card)])),
  );
  const filters = $derived<SpendingFilter[]>([
    {
      id: "card",
      allLabel: "全部卡片",
      value: (item) =>
        cardNames.get(
          data.accountOfTransaction.get(item.transactionId ?? item.id) ?? "",
        ) ?? "其他",
    },
    { id: "category", allLabel: "全部類別", value: (item) => item.category },
  ]);

  function choosePeriod(key: string) {
    selectedPeriod = key;
    detailFilters = {};
  }

  function shortDate(date: string) {
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  }
</script>

{#if data.pending}
  <EmptyState title="載入信用卡中" body="正在整理信用卡、帳單與刷卡資料。" />
{:else}
  <div class="grid min-w-0 max-w-full gap-6 overflow-x-clip pt-3 md:pt-2">
    {#if data.failed}
      <div
        class="flex flex-col gap-3 rounded-xl border border-coral/25 bg-coral/5 px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p class="font-semibold text-coral">部分資料載入失敗，金額可能不完整</p>
        <Button class="h-11 shrink-0" variant="outline" onclick={data.retry}
          >重試</Button
        >
      </div>
    {/if}

    <section class="min-w-0" aria-label="結算期間">
      <PeriodPicker
        {periodKeys}
        {currentPeriod}
        selected={selectedPeriod}
        onChange={choosePeriod}
      />
    </section>

    <section
      class="grid grid-cols-2 gap-3 lg:grid-cols-4"
      aria-label="信用卡總覽"
    >
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">本期刷卡</p>
        <p
          class="mt-1 text-2xl font-semibold tracking-tight text-coral tabular-nums"
        >
          {formatCurrency(periodSpend)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          {cards.length} 張卡 · {cardItems.length} 筆
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">已用額度</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {limited.length ? formatCurrency(totalUsed) : "—"}
        </p>
        <p class="mt-1 text-caption text-subtle">
          {limited.length
            ? `總額度 ${formatCurrency(totalLimit)}（${Math.round((totalUsed / totalLimit) * 100)}%）`
            : "銀行都未提供額度"}
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">待繳帳單</p>
        <p
          class={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${unpaid.length ? "text-coral" : ""}`}
        >
          {formatCurrency(unpaid.reduce((sum, bill) => sum + bill.amount, 0))}
        </p>
        <p class="mt-1 text-caption text-subtle">
          {unpaid.length
            ? `${unpaid.length} 張未繳${nextDue ? `，最近截止 ${shortDate(nextDue)}` : ""}`
            : "最新帳單都已繳"}
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">本期繳卡費</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.cardPayment)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          從銀行帳戶扣款，付的是上期帳
        </p>
      </div>
    </section>

    <CreditCardSection {cards} rates={data.rates} />

    <section class="min-w-0 border-t border-ink/10 pt-5" aria-label="刷卡明細">
      <h2 class="text-base font-semibold">刷卡明細</h2>
      <p class="mt-1 text-caption text-subtle">
        所有卡片本期刷卡，點欄位標題可排序
      </p>
      <SpendingTable
        items={cardItems}
        rates={data.rates}
        {filters}
        bind:selected={detailFilters}
        describe={(item) =>
          cardNames.get(
            data.accountOfTransaction.get(item.transactionId ?? item.id) ?? "",
          ) ?? "信用卡"}
      />
    </section>
  </div>
{/if}
