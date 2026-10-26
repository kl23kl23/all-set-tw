<script lang="ts" module>
  import type { ActivityItem } from "@taiwan-fin-hub/shared";

  export interface SpendingFilter {
    id: string;
    /** Label of the "no filter" option, e.g. 全部類別. */
    allLabel: string;
    value: (item: ActivityItem) => string;
    optionLabel?: (value: string) => string;
  }
</script>

<script lang="ts">
  import { activityDateKey } from "@taiwan-fin-hub/shared";
  import { Search } from "@lucide/svelte";
  import Input from "@/shared/ui/Input.svelte";
  import Select from "@/shared/ui/Select.svelte";
  import { activityFlowAmountTwd } from "@/features/activity/model/chart";
  import { formatCurrency } from "@/shared/format/financial";

  let {
    items,
    rates,
    filters,
    selected = $bindable({}),
    describe,
  }: {
    items: ActivityItem[];
    rates: Record<string, number>;
    filters: SpendingFilter[];
    /** Chosen value per filter id; empty or missing means all. */
    selected?: Record<string, string>;
    describe: (item: ActivityItem) => string;
  } = $props();

  let searchText = $state("");
  let sort = $state<{
    key: "date" | "title" | "category" | "amount";
    dir: 1 | -1;
  }>({ key: "date", dir: -1 });

  const options = $derived(
    Object.fromEntries(
      filters.map((filter) => [
        filter.id,
        [...new Set(items.map(filter.value))].sort((a, b) =>
          a.localeCompare(b, "zh-TW"),
        ),
      ]),
    ),
  );

  const rows = $derived.by(() => {
    const query = searchText.trim().toLowerCase();
    const result = items
      .filter(
        (item) =>
          filters.every(
            (filter) =>
              !selected[filter.id] ||
              filter.value(item) === selected[filter.id],
          ) &&
          (!query ||
            `${item.title} ${item.subtitle}`.toLowerCase().includes(query)),
      )
      .map((item) => ({
        item,
        date: activityDateKey(item),
        amount: activityFlowAmountTwd(item, "expense", rates),
      }));
    const value = (row: (typeof result)[number]) =>
      sort.key === "date"
        ? row.date
        : sort.key === "amount"
          ? row.amount
          : sort.key === "title"
            ? row.item.title
            : row.item.category;
    return result.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      return (left < right ? -1 : left > right ? 1 : 0) * sort.dir;
    });
  });
  const total = $derived(rows.reduce((sum, row) => sum + row.amount, 0));

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

  function shortDate(date: string) {
    return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  }

  function setFilter(id: string, value: string) {
    selected = { ...selected, [id]: value };
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

<div class="mt-3 flex flex-col gap-2 sm:flex-row">
  {#each filters as filter (filter.id)}
    <Select
      aria-label={filter.allLabel.replace("全部", "篩選")}
      class="h-10 sm:w-auto"
      value={selected[filter.id] ?? ""}
      onchange={(event: Event) =>
        setFilter(filter.id, (event.currentTarget as HTMLSelectElement).value)}
      ><option value="">{filter.allLabel}</option
      >{#each options[filter.id] ?? [] as value (value)}<option {value}
          >{filter.optionLabel?.(value) ?? value}</option
        >{/each}</Select
    >
  {/each}
  <div class="relative min-w-0 flex-1">
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
  {rows.length} 筆，合計 {formatCurrency(total)}
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
      {#each rows as row (`${row.item.source}:${row.item.id}`)}
        <tr class="border-b border-ink/5 align-top">
          <td class="whitespace-nowrap px-2 py-2.5 text-subtle"
            >{shortDate(row.date)}</td
          >
          <td class="min-w-0 px-2 py-2.5">
            <p class="font-medium">{row.item.title}</p>
            <p class="text-caption text-subtle">
              {describe(row.item)}{row.item.status === "pending"
                ? " · 待入帳"
                : ""}
            </p>
          </td>
          <td class="whitespace-nowrap px-2 py-2.5">{row.item.category}</td>
          <td class="whitespace-nowrap px-2 py-2.5 text-right font-semibold"
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
