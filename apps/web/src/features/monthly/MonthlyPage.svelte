<script lang="ts">
  import { activityDateKey, type ActivityItem } from "@taiwan-fin-hub/shared";
  import Button from "@/shared/ui/Button.svelte";
  import EmptyState from "@/shared/ui/EmptyState.svelte";
  import type { ApiClient } from "@/shared/api/client";
  import { ACTIVITY_CATEGORY_COLORS } from "@/features/activity/model/chart";
  import {
    formatCompactTwd,
    formatCurrency,
    formatNumber,
  } from "@/shared/format/financial";
  import { rankCategories, type SetAsideKind } from "./model/summary";
  import { createPeriodData } from "./model/period-data.svelte";
  import PeriodPicker from "./components/PeriodPicker.svelte";
  import SpendingTable, {
    type SpendingFilter,
  } from "./components/SpendingTable.svelte";

  let { api }: { api: ApiClient } = $props();

  /** Stacked bars show this many categories; the rest share one segment. */
  const CHART_CATEGORIES = 6;
  const OTHER = "其他類別";
  const SOURCE_LABELS: Record<string, string> = {
    bank: "銀行",
    card: "信用卡",
    invoice: "發票",
  };
  const SET_ASIDE_LABELS: Record<SetAsideKind, string> = {
    investment: "股市",
    "top-up": "電子支付儲值",
    "card-payment": "繳信用卡費",
    transfer: "轉帳",
  };
  const DETAIL_FILTERS: SpendingFilter[] = [
    {
      id: "source",
      allLabel: "全部來源",
      value: (item) => item.source,
      optionLabel: (value) => SOURCE_LABELS[value] ?? value,
    },
    { id: "category", allLabel: "全部類別", value: (item) => item.category },
  ];

  const data = createPeriodData(() => api);
  const { currentPeriod, periodKeys } = data;

  let selectedPeriod = $state(currentPeriod);
  let detailFilters = $state<Record<string, string>>({});

  const summaries = $derived(data.summaries);
  const periods = $derived(periodKeys.map((key) => summaries.get(key)!));
  const summary = $derived(summaries.get(selectedPeriod)!);
  const previous = $derived(
    summaries.get(periodKeys[periodKeys.indexOf(selectedPeriod) - 1] ?? ""),
  );
  const categories = $derived(rankCategories(periods));

  // Averages skip the running period and periods before any data arrived.
  const closedPeriods = $derived(
    periods.filter(
      (row) => row.key !== currentPeriod && row.spending.length > 0,
    ),
  );
  const average = $derived(
    closedPeriods.length
      ? closedPeriods.reduce((sum, row) => sum + row.expense, 0) /
          closedPeriods.length
      : null,
  );
  const highest = $derived(
    periods.reduce<(typeof periods)[number] | null>(
      (top, row) =>
        row.expense > 0 && (!top || row.expense > top.expense) ? row : top,
      null,
    ),
  );
  const topCategory = $derived(
    [...summary.byCategory.entries()].sort((a, b) => b[1] - a[1])[0],
  );
  const takeaway = $derived.by(() => {
    if (summary.spending.length === 0) return "這一期還沒有消費紀錄。";
    const parts = [
      `${monthLabel(selectedPeriod)}份${selectedPeriod === currentPeriod ? "目前" : ""}其他開銷 ${formatCurrency(summary.expense)}`,
    ];
    if (previous && previous.expense > 0)
      parts.push(
        `比 ${monthLabel(previous.key)}${summary.expense >= previous.expense ? "多" : "少"} ${formatCurrency(Math.abs(summary.expense - previous.expense))}`,
      );
    if (topCategory)
      parts.push(
        `最多花在${topCategory[0]}（${formatCurrency(topCategory[1])}）`,
      );
    return `${parts.join("，")}。`;
  });

  const chartKeys = $derived.by(() => {
    const top = categories
      .slice(0, CHART_CATEGORIES)
      .map((row) => row.category);
    return categories.length > CHART_CATEGORIES ? [...top, OTHER] : top;
  });
  const chartBars = $derived(
    periods.map((row) => {
      const segments = new Map(chartKeys.map((key) => [key, 0]));
      for (const [category, amount] of row.byCategory) {
        const key = segments.has(category) ? category : OTHER;
        segments.set(key, (segments.get(key) ?? 0) + Math.max(amount, 0));
      }
      return { key: row.key, total: row.expense, segments };
    }),
  );
  const chartMax = $derived(
    Math.max(
      ...chartBars.map((bar) =>
        [...bar.segments.values()].reduce((sum, value) => sum + value, 0),
      ),
      1,
    ),
  );

  function monthLabel(key: string) {
    return `${Number(key.slice(5))} 月`;
  }

  function shortDate(date: string) {
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  }

  function colorFor(key: string) {
    if (key === OTHER) return "#9aa3a8";
    return ACTIVITY_CATEGORY_COLORS[
      chartKeys.indexOf(key) % ACTIVITY_CATEGORY_COLORS.length
    ]!;
  }

  function choosePeriod(key: string) {
    selectedPeriod = key;
    detailFilters = {};
  }

  function chooseCategory(category: string) {
    detailFilters = {
      ...detailFilters,
      category: detailFilters.category === category ? "" : category,
    };
    document
      .getElementById("monthly-detail")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function itemKey(item: ActivityItem) {
    return `${item.source}:${item.id}`;
  }
</script>

{#if data.pending}
  <EmptyState title="載入月份收支中" body="正在整理銀行、信用卡與發票資料。" />
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
      <p class="mt-4 text-base leading-7 text-ink">{takeaway}</p>
    </section>

    <section
      class="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      aria-label="本期數字"
    >
      <div class="col-span-2 rounded-xl border border-ink/10 p-4 md:col-span-1">
        <p class="text-caption text-subtle">本期其他開銷</p>
        <p
          class="mt-1 text-2xl font-semibold tracking-tight text-coral tabular-nums"
        >
          {formatCurrency(summary.expense)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          不含股市、儲值、繳卡費、轉帳
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">每期平均</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {average == null ? "—" : formatCurrency(average)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          {closedPeriods.length
            ? `已結算的 ${closedPeriods.length} 期`
            : "還沒有已結算的期別"}
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">最高的一期</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {highest ? formatCurrency(highest.expense) : "—"}
        </p>
        <p class="mt-1 text-caption text-subtle">
          {highest ? `${monthLabel(highest.key)}份` : "近 6 期"}
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">股市交割與抽籤</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.investmentOut)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          本期入帳 {formatCurrency(summary.investmentIn)}
        </p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">電子支付儲值</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.topUp)}
        </p>
        <p class="mt-1 text-caption text-subtle">本期，另列</p>
      </div>
      <div class="rounded-xl border border-ink/10 p-4">
        <p class="text-caption text-subtle">信用卡繳款</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.cardPayment)}
        </p>
        <p class="mt-1 text-caption text-subtle">本期，付的是上期帳</p>
      </div>
    </section>

    <div class="grid min-w-0 gap-6 xl:grid-cols-2">
      <section class="min-w-0 border-t border-ink/10 pt-5">
        <h2 class="text-base font-semibold">每期其他開銷（依類別）</h2>
        <p class="mt-1 text-caption text-subtle">點長條切換期別</p>
        <div class="mt-4 grid grid-cols-6 gap-1 md:gap-3">
          {#each chartBars as bar (bar.key)}
            <button
              aria-pressed={selectedPeriod === bar.key}
              aria-label={`${monthLabel(bar.key)}份其他開銷 ${formatCurrency(bar.total)}`}
              class={`grid min-w-0 justify-items-center px-1 pb-2 pt-3 text-center transition ${selectedPeriod === bar.key ? "bg-ink/4 shadow-[inset_0_-2px_0_var(--color-steel)]" : "hover:bg-ink/3"}`}
              onclick={() => choosePeriod(bar.key)}
            >
              <div
                class="flex h-36 w-full flex-col-reverse items-center md:h-44"
              >
                {#each chartKeys as key (key)}
                  {@const value = bar.segments.get(key) ?? 0}
                  {#if value > 0}
                    <span
                      class="w-3/5 border-t border-paper first:rounded-b-sm last:rounded-t-sm"
                      style={`height:${(value / chartMax) * 100}%;background:${colorFor(key)}`}
                      title={`${key} ${formatCurrency(value)}`}
                    ></span>
                  {/if}
                {/each}
              </div>
              <span class="mt-2 w-full text-caption font-semibold"
                >{monthLabel(bar.key)}</span
              ><span
                class="w-full truncate text-caption font-medium tabular-nums text-coral"
                >{formatCompactTwd(bar.total)}</span
              >
            </button>
          {/each}
        </div>
        {#if chartKeys.length}
          <div
            class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-subtle"
          >
            {#each chartKeys as key (key)}
              <span class="inline-flex items-center gap-1.5"
                ><span
                  class="size-2 rounded-[2px]"
                  style={`background:${colorFor(key)}`}
                ></span>{key}</span
              >
            {/each}
          </div>
        {/if}
      </section>

      <section class="min-w-0 border-t border-ink/10 pt-5">
        <h2 class="text-base font-semibold">類別 × 期別</h2>
        <p class="mt-1 text-caption text-subtle">點類別看明細</p>
        <div class="mt-3 max-h-[26rem] overflow-auto">
          <table class="w-full border-collapse text-caption tabular-nums">
            <thead>
              <tr class="border-b border-ink/10">
                <th
                  class="sticky left-0 top-0 bg-paper px-2 py-2 text-left font-medium text-subtle"
                  >類別</th
                >
                {#each periodKeys as key (key)}
                  <th
                    class={`sticky top-0 whitespace-nowrap bg-paper px-2 py-2 text-right font-medium ${key === selectedPeriod ? "text-ink" : "text-subtle"}`}
                    >{monthLabel(key)}</th
                  >
                {/each}
                <th
                  class="sticky top-0 bg-paper px-2 py-2 text-right font-medium text-subtle"
                  >合計</th
                >
              </tr>
            </thead>
            <tbody>
              {#each categories as row (row.category)}
                <tr class="border-b border-ink/5">
                  <td class="sticky left-0 bg-paper px-2 py-2">
                    <button
                      class={`whitespace-nowrap text-left font-medium ${detailFilters.category === row.category ? "text-steel underline" : ""}`}
                      onclick={() => chooseCategory(row.category)}
                      >{row.category}</button
                    >
                  </td>
                  {#each periods as column (column.key)}
                    {@const value = column.byCategory.get(row.category) ?? 0}
                    <td
                      class={`px-2 py-2 text-right ${column.key === selectedPeriod ? "bg-ink/4" : ""} ${value ? "" : "text-subtle/60"}`}
                      >{value ? formatNumber(Math.round(value)) : "·"}</td
                    >
                  {/each}
                  <td class="px-2 py-2 text-right font-semibold"
                    >{formatNumber(Math.round(row.total))}</td
                  >
                </tr>
              {:else}
                <tr
                  ><td
                    class="px-2 py-4 text-subtle"
                    colspan={periodKeys.length + 2}>還沒有消費紀錄。</td
                  ></tr
                >
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section class="min-w-0 border-t border-ink/10 pt-5">
      <h2 class="text-base font-semibold">另列項目</h2>
      <p class="mt-1 text-caption text-subtle">
        股市交割與抽籤、電子支付儲值、信用卡繳款與沒寫用途的轉帳只是把錢移到別處，不算進其他開銷；ATM
        領現金與轉給家人的錢算開銷
      </p>
      {#if summary.setAside.length === 0}
        <p class="mt-3 text-sm text-subtle">本期沒有另列項目。</p>
      {:else}
        <ul class="mt-2 divide-y divide-ink/5">
          {#each summary.setAside as row (itemKey(row.item))}
            <li class="flex items-start justify-between gap-3 py-2.5">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{row.item.title}</p>
                <p class="mt-0.5 truncate text-caption text-subtle">
                  {shortDate(activityDateKey(row.item))} · {SET_ASIDE_LABELS[
                    row.kind
                  ]}{row.item.institutionName
                    ? ` · ${row.item.institutionName}`
                    : ""}
                </p>
              </div>
              <span
                class="shrink-0 text-sm font-semibold tabular-nums text-subtle"
                >{row.amount > 0 ? "+" : ""}{formatCurrency(row.amount)}</span
              >
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section
      id="monthly-detail"
      class="min-w-0 scroll-mt-24 border-t border-ink/10 pt-5"
      aria-label="逐筆明細"
    >
      <h2 class="text-base font-semibold">逐筆明細</h2>
      <p class="mt-1 text-caption text-subtle">
        {monthLabel(selectedPeriod)}份其他開銷，點欄位標題可排序
      </p>
      <SpendingTable
        items={summary.spending}
        rates={data.rates}
        filters={DETAIL_FILTERS}
        bind:selected={detailFilters}
        describe={(item) =>
          [SOURCE_LABELS[item.source] ?? item.source, item.institutionName]
            .filter(Boolean)
            .join(" · ")}
      />
    </section>
  </div>
{/if}
