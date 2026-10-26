<script lang="ts">
  import {
    activityDateKey,
    buildActivityItems,
    type ActivityItem,
  } from "@taiwan-fin-hub/shared";
  import { createQuery } from "@tanstack/svelte-query";
  import { ChevronLeft, ChevronRight, Search } from "@lucide/svelte";
  import Badge from "@/shared/ui/Badge.svelte";
  import Button from "@/shared/ui/Button.svelte";
  import EmptyState from "@/shared/ui/EmptyState.svelte";
  import Input from "@/shared/ui/Input.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import type { ApiClient } from "@/shared/api/client";
  import { exchangeRatesQuery } from "@/data/assets/queries";
  import { bankRangeQuery } from "@/data/bank/queries";
  import {
    invoiceTransactionMappingsQuery,
    invoicesRangeQuery,
  } from "@/data/invoices/queries";
  import {
    deduplicateBankTransactions,
    matchInvoicesToTransactions,
  } from "@/data/activity/matching";
  import {
    ACTIVITY_CATEGORY_COLORS,
    activityFlowAmountTwd,
  } from "@/features/activity/model/chart";
  import {
    formatCompactTwd,
    formatCurrency,
    formatNumber,
    rateMap,
  } from "@/shared/format/financial";
  import {
    formatPeriodLabel,
    formatPeriodRange,
    periodKeyForDate,
    periodsMonthRange,
    recentPeriodKeys,
    statementPeriod,
  } from "./model/period";
  import {
    rankCategories,
    summarizePeriods,
    type SetAsideKind,
  } from "./model/summary";

  let { api }: { api: ApiClient } = $props();

  const PERIOD_COUNT = 6;
  /** Stacked bars show this many categories; the rest share one segment. */
  const CHART_CATEGORIES = 6;
  const OTHER = "其他類別";
  const SOURCE_LABELS: Record<string, string> = {
    bank: "銀行",
    card: "信用卡",
    invoice: "發票",
  };
  const SET_ASIDE_LABELS: Record<SetAsideKind, string> = {
    "top-up": "電子支付儲值",
    "card-payment": "繳信用卡費",
  };

  const today = activityDateKey({
    date: new Date().toISOString(),
    dateHasTime: true,
    source: "bank",
  });
  const currentPeriod = periodKeyForDate(today);
  const periodKeys = recentPeriodKeys(currentPeriod, PERIOD_COUNT);
  const range = periodsMonthRange(periodKeys);

  const bank = createQuery(() => bankRangeQuery(() => api, range));
  const invoices = createQuery(() => invoicesRangeQuery(() => api, range));
  const invoiceMappings = createQuery(() =>
    invoiceTransactionMappingsQuery(() => api, range),
  );
  const rates = createQuery(() => exchangeRatesQuery(() => api));

  let selectedPeriod = $state(currentPeriod);
  let sourceFilter = $state("");
  let categoryFilter = $state("");
  let searchText = $state("");
  let sort = $state<{
    key: "date" | "title" | "category" | "amount";
    dir: 1 | -1;
  }>({ key: "date", dir: -1 });

  const rateValues = $derived(rateMap(rates.data));
  const dataFailed = $derived(
    bank.isError || invoices.isError || invoiceMappings.isError,
  );

  const items = $derived.by(() => {
    const accounts = new Map(
      (bank.data?.accounts ?? []).map((account) => [account.id, account]),
    );
    const transactions = deduplicateBankTransactions(
      (bank.data?.transactions ?? []).map((transaction) => ({
        ...transaction,
        accountType:
          transaction.accountType ??
          accounts.get(transaction.accountId)?.accountType,
      })),
    );
    const matches = matchInvoicesToTransactions(
      transactions,
      invoices.data ?? [],
      invoiceMappings.data ?? [],
    );
    // Investment trades are not spending, so the period summary skips them.
    return buildActivityItems(
      transactions,
      invoices.data ?? [],
      [],
      accounts,
      matches,
    );
  });

  const summaries = $derived(summarizePeriods(items, periodKeys, rateValues));
  const periods = $derived(periodKeys.map((key) => summaries.get(key)!));
  const summary = $derived(summaries.get(selectedPeriod)!);
  const period = $derived(statementPeriod(selectedPeriod));
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
      `${monthLabel(selectedPeriod)}份${selectedPeriod === currentPeriod ? "目前" : ""}支出 ${formatCurrency(summary.expense)}`,
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

  const detailRows = $derived.by(() => {
    const query = searchText.trim().toLowerCase();
    const rows = summary.spending
      .filter(
        (item) =>
          (!sourceFilter || item.source === sourceFilter) &&
          (!categoryFilter || item.category === categoryFilter) &&
          (!query ||
            `${item.title} ${item.subtitle}`.toLowerCase().includes(query)),
      )
      .map((item) => ({
        item,
        date: activityDateKey(item),
        amount: activityFlowAmountTwd(item, "expense", rateValues),
      }));
    const value = (row: (typeof rows)[number]) =>
      sort.key === "date"
        ? row.date
        : sort.key === "amount"
          ? row.amount
          : sort.key === "title"
            ? row.item.title
            : row.item.category;
    return rows.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * sort.dir;
    });
  });
  const detailTotal = $derived(
    detailRows.reduce((sum, row) => sum + row.amount, 0),
  );
  const periodCategories = $derived(
    [...summary.byCategory.keys()].sort((a, b) => a.localeCompare(b, "zh-TW")),
  );
  const periodSources = $derived([
    ...new Set(summary.spending.map((item) => item.source)),
  ]);

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
    categoryFilter = "";
  }

  function shiftPeriod(offset: number) {
    const next = periodKeys[periodKeys.indexOf(selectedPeriod) + offset];
    if (next) choosePeriod(next);
  }

  function chooseCategory(category: string) {
    categoryFilter = categoryFilter === category ? "" : category;
    document
      .getElementById("monthly-detail")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function sortBy(key: typeof sort.key) {
    sort =
      sort.key === key
        ? { key, dir: sort.dir === 1 ? -1 : 1 }
        : { key, dir: key === "date" || key === "amount" ? -1 : 1 };
  }

  function sortState(key: typeof sort.key) {
    if (sort.key !== key) return "none";
    return sort.dir === 1 ? "ascending" : "descending";
  }

  function itemKey(item: ActivityItem) {
    return `${item.source}:${item.id}`;
  }

  function retry() {
    void bank.refetch();
    void invoices.refetch();
    void invoiceMappings.refetch();
  }
</script>

{#snippet sortHeader(key: typeof sort.key, label: string, alignEnd = false)}
  <th
    aria-sort={sortState(key)}
    class={`sticky top-0 bg-paper px-2 py-2 font-medium text-subtle ${alignEnd ? "text-right" : "text-left"}`}
  >
    <button class="whitespace-nowrap" onclick={() => sortBy(key)}
      >{label}{sort.key === key ? (sort.dir === 1 ? " ↑" : " ↓") : ""}</button
    >
  </th>
{/snippet}

{#if bank.isPending || invoices.isPending || invoiceMappings.isPending}
  <EmptyState title="載入月份收支中" body="正在整理銀行、信用卡與發票資料。" />
{:else}
  <div class="grid min-w-0 max-w-full gap-6 overflow-x-clip pt-3 md:pt-2">
    {#if dataFailed}
      <div
        class="flex flex-col gap-3 rounded-xl border border-coral/25 bg-coral/5 px-4 py-3 text-sm text-ink sm:flex-row sm:items-center sm:justify-between"
        role="alert"
      >
        <p class="font-semibold text-coral">部分資料載入失敗，金額可能不完整</p>
        <Button class="h-11 shrink-0" variant="outline" onclick={retry}
          >重試</Button
        >
      </div>
    {/if}

    <section class="min-w-0" aria-label="結算期間">
      <div class="flex min-w-0 items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="上一期"
          disabled={selectedPeriod === periodKeys[0]}
          onclick={() => shiftPeriod(-1)}><ChevronLeft class="size-5" /></Button
        >
        <Select
          aria-label="選擇結算月份"
          class="h-11 min-w-0 flex-1 font-semibold sm:w-auto sm:flex-none"
          value={selectedPeriod}
          onchange={(event: Event) =>
            choosePeriod((event.currentTarget as HTMLSelectElement).value)}
          >{#each [...periodKeys].reverse() as key (key)}<option value={key}
              >{formatPeriodLabel(key)}（{formatPeriodRange(
                statementPeriod(key),
              )}）</option
            >{/each}</Select
        >
        <Button
          variant="outline"
          size="icon"
          aria-label="下一期"
          disabled={selectedPeriod === currentPeriod}
          onclick={() => shiftPeriod(1)}><ChevronRight class="size-5" /></Button
        >
      </div>
      <p class="mt-2 flex items-center gap-2 text-caption text-subtle">
        每月 15 日結算 · {period.start.replaceAll(
          "-",
          "/",
        )}～{period.end.replaceAll("-", "/")}
        {#if selectedPeriod === currentPeriod}<Badge>進行中</Badge>{/if}
      </p>
      <p class="mt-4 text-base leading-7 text-ink">{takeaway}</p>
    </section>

    <section
      class="grid grid-cols-2 gap-3 lg:grid-cols-5"
      aria-label="本期數字"
    >
      <div class="col-span-2 rounded-xl border border-ink/10 p-4 lg:col-span-1">
        <p class="text-caption text-subtle">本期支出</p>
        <p
          class="mt-1 text-2xl font-semibold tracking-tight text-coral tabular-nums"
        >
          {formatCurrency(summary.expense)}
        </p>
        <p class="mt-1 text-caption text-subtle">
          收入 {formatCurrency(summary.income)}
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
        <p class="text-caption text-subtle">電子支付儲值</p>
        <p class="mt-1 text-xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.topUp)}
        </p>
        <p class="mt-1 text-caption text-subtle">本期，另列不算支出</p>
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
        <h2 class="text-base font-semibold">每期支出（依類別）</h2>
        <p class="mt-1 text-caption text-subtle">點長條切換期別</p>
        <div class="mt-4 grid grid-cols-6 gap-1 md:gap-3">
          {#each chartBars as bar (bar.key)}
            <button
              aria-pressed={selectedPeriod === bar.key}
              aria-label={`${monthLabel(bar.key)}份支出 ${formatCurrency(bar.total)}`}
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
                      class={`whitespace-nowrap text-left font-medium ${categoryFilter === row.category ? "text-steel underline" : ""}`}
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
        電子支付儲值與信用卡繳款只是把錢移到別處，真正的消費已在刷卡或支付明細裡，不重複算進支出
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
                >{formatCurrency(row.amount)}</span
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
        {monthLabel(selectedPeriod)}份支出，點欄位標題可排序
      </p>
      <div class="mt-3 grid gap-2 sm:grid-cols-[auto_auto_1fr]">
        <Select
          aria-label="篩選來源"
          class="h-10 sm:w-auto"
          bind:value={sourceFilter}
          ><option value="">全部來源</option
          >{#each periodSources as source (source)}<option value={source}
              >{SOURCE_LABELS[source] ?? source}</option
            >{/each}</Select
        >
        <Select
          aria-label="篩選類別"
          class="h-10 sm:w-auto"
          bind:value={categoryFilter}
          ><option value="">全部類別</option
          >{#each periodCategories as category (category)}<option
              value={category}>{category}</option
            >{/each}</Select
        >
        <div class="relative min-w-0">
          <Search
            class="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-subtle"
          />
          <Input
            type="search"
            aria-label="搜尋商店"
            placeholder="搜尋商店…"
            class="h-10 pl-9"
            bind:value={searchText}
            maxlength={100}
          />
        </div>
      </div>
      <p class="mt-3 text-caption text-subtle" role="status">
        {detailRows.length} 筆，合計 {formatCurrency(detailTotal)}
      </p>
      <div class="mt-2 max-h-[36rem] overflow-auto">
        <table class="w-full border-collapse text-sm tabular-nums">
          <thead>
            <tr class="border-b border-ink/10 text-caption">
              {@render sortHeader("date", "日期")}
              {@render sortHeader("title", "商店")}
              {@render sortHeader("category", "類別")}
              {@render sortHeader("amount", "金額", true)}
            </tr>
          </thead>
          <tbody>
            {#each detailRows as row (itemKey(row.item))}
              <tr class="border-b border-ink/5 align-top">
                <td class="whitespace-nowrap px-2 py-2.5 text-subtle"
                  >{shortDate(row.date)}</td
                >
                <td class="min-w-0 px-2 py-2.5">
                  <p class="font-medium">{row.item.title}</p>
                  <p class="text-caption text-subtle">
                    {SOURCE_LABELS[row.item.source] ?? row.item.source}{row.item
                      .institutionName
                      ? ` · ${row.item.institutionName}`
                      : ""}
                  </p>
                </td>
                <td class="whitespace-nowrap px-2 py-2.5"
                  >{row.item.category}</td
                >
                <td
                  class="whitespace-nowrap px-2 py-2.5 text-right font-semibold"
                  >{formatCurrency(row.amount)}</td
                >
              </tr>
            {:else}
              <tr
                ><td class="px-2 py-4 text-subtle" colspan="4"
                  >沒有符合條件的紀錄。</td
                ></tr
              >
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  </div>
{/if}
