<script lang="ts">
  import { activityDateKey } from "@taiwan-fin-hub/shared";
  import { activityFlowAmountTwd } from "@/features/activity/model/chart";
  import { formatCurrency } from "@/shared/format/financial";
  import type { CardSummary } from "../model/cards";

  let {
    cards,
    periodLabel,
    rates,
  }: {
    cards: CardSummary[];
    periodLabel: string;
    rates: Record<string, number>;
  } = $props();

  const periodTotal = $derived(
    cards.reduce((sum, card) => sum + card.periodSpend, 0),
  );

  function cardName(card: CardSummary) {
    const { institutionName, accountName, accountLast4 } = card.account;
    return [
      institutionName,
      accountName ?? (accountLast4 && `末四碼 ${accountLast4}`),
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function usageTone(usage: number) {
    if (usage >= 0.8) return "bg-coral";
    if (usage >= 0.5) return "bg-amber-500";
    return "bg-steel";
  }

  function shortDate(date?: string | null) {
    if (!date) return "—";
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  }

  function billStatus(card: CardSummary) {
    const bill = card.latestBill;
    if (!bill) return null;
    if (bill.isPaid) return "已繳";
    if (bill.paidAmount) return `已繳 ${formatCurrency(bill.paidAmount)}`;
    return "未繳";
  }
</script>

<section class="min-w-0 border-t border-ink/10 pt-5" aria-label="信用卡">
  <div class="flex items-baseline justify-between gap-3">
    <h2 class="text-base font-semibold">信用卡</h2>
    <span class="text-caption text-subtle"
      >{periodLabel}刷卡合計 {formatCurrency(periodTotal)}</span
    >
  </div>
  <p class="mt-1 text-caption text-subtle">
    額度使用以銀行最近一次同步為準；點卡片展開本期刷卡明細
  </p>
  {#if cards.length === 0}
    <p class="mt-3 text-sm text-subtle">還沒有同步到信用卡。</p>
  {:else}
    <div class="mt-4 grid gap-3 md:grid-cols-2">
      {#each cards as card (card.account.id)}
        <details class="group rounded-xl border border-ink/10 p-4">
          <summary class="cursor-pointer list-none">
            <div class="flex items-start justify-between gap-3">
              <p class="min-w-0 truncate font-semibold">{cardName(card)}</p>
              <p class="shrink-0 text-right">
                <span class="block text-caption text-subtle">本期刷卡</span>
                <span class="font-semibold tabular-nums text-coral"
                  >{formatCurrency(card.periodSpend)}</span
                >
              </p>
            </div>

            <div class="mt-3">
              {#if card.usage != null}
                <div class="h-2 overflow-hidden rounded-full bg-ink/8">
                  <div
                    class={`h-full rounded-full ${usageTone(card.usage)}`}
                    style={`width:${Math.min(card.usage, 1) * 100}%`}
                  ></div>
                </div>
                <p class="mt-1.5 text-caption text-subtle tabular-nums">
                  已用 {formatCurrency(card.used ?? 0)} / 額度 {formatCurrency(
                    card.limit ?? 0,
                  )}（{Math.round(card.usage * 100)}%）
                </p>
              {:else}
                <p class="text-caption text-subtle tabular-nums">
                  目前欠款 {card.used == null ? "—" : formatCurrency(card.used)} ·
                  銀行未提供額度
                </p>
              {/if}
            </div>

            {#if card.latestBill}
              <p class="mt-2 text-caption text-subtle tabular-nums">
                {Number(card.latestBill.billingPeriod.slice(5))} 月帳單
                {card.latestBill.statementAmount == null
                  ? "—"
                  : formatCurrency(card.latestBill.statementAmount)} · 截止
                {shortDate(card.latestBill.paymentDueDate)} ·
                <span
                  class={billStatus(card) === "未繳"
                    ? "font-semibold text-coral"
                    : ""}>{billStatus(card)}</span
                >
              </p>
            {/if}
            <p
              class="mt-2 text-caption font-semibold text-steel group-open:hidden"
            >
              看 {card.periodItems.length} 筆明細 ▾
            </p>
          </summary>

          {#if card.periodItems.length === 0}
            <p class="mt-3 text-sm text-subtle">本期沒有刷卡紀錄。</p>
          {:else}
            <ul class="mt-3 divide-y divide-ink/5 border-t border-ink/10">
              {#each [...card.periodItems].sort( (a, b) => activityDateKey(b).localeCompare(activityDateKey(a)) ) as item (item.id)}
                <li class="flex items-start justify-between gap-3 py-2">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">{item.title}</p>
                    <p class="text-caption text-subtle">
                      {shortDate(activityDateKey(item))} · {item.category}{item.status ===
                      "pending"
                        ? " · 待入帳"
                        : ""}
                    </p>
                  </div>
                  <span class="shrink-0 text-sm font-semibold tabular-nums"
                    >{formatCurrency(
                      activityFlowAmountTwd(item, "expense", rates),
                    )}</span
                  >
                </li>
              {/each}
            </ul>
          {/if}
        </details>
      {/each}
    </div>
  {/if}
</section>
