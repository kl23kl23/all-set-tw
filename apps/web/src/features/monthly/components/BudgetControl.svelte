<script lang="ts">
  import {
    budgetOptions,
    type BudgetKind,
    type SpendingBudgetsResponse,
  } from "@taiwan-fin-hub/shared";
  import {
    createMutation,
    createQuery,
    useQueryClient,
  } from "@tanstack/svelte-query";
  import Select from "@/shared/ui/Select.svelte";
  import type { ApiClient } from "@/shared/api/client";
  import { queryKeys } from "@/shared/api/query-keys";
  import { spendingBudgetsQuery } from "@/data/budgets/queries";
  import { formatCurrency } from "@/shared/format/financial";

  let {
    api,
    kind,
    label,
    spent,
    showUsage,
  }: {
    api: ApiClient;
    kind: BudgetKind;
    label: string;
    /** Spending in the selected period. */
    spent: number;
    /** Usage only reads right for the running period. */
    showUsage: boolean;
  } = $props();

  const qc = useQueryClient();
  const budgets = createQuery(() => spendingBudgetsQuery(() => api));
  const save = createMutation(() => ({
    mutationFn: (monthlyLimit: number | null) =>
      api.put<SpendingBudgetsResponse>(`/api/budgets/${kind}`, {
        monthlyLimit,
      }),
    onSuccess: (data) => qc.setQueryData(queryKeys.budgets, data),
  }));

  const limit = $derived(budgets.data?.budgets[kind] ?? null);
  const usage = $derived(limit ? spent / limit : 0);
</script>

<div class="flex min-w-0 flex-col gap-1 sm:items-end">
  <Select
    aria-label={label}
    class="h-11 w-full font-semibold sm:w-auto"
    value={limit == null ? "" : String(limit)}
    disabled={budgets.isPending || save.isPending}
    onchange={(event: Event) => {
      const value = (event.currentTarget as HTMLSelectElement).value;
      save.mutate(value ? Number(value) : null);
    }}
    ><option value="">{label}：不設定</option
    >{#each budgetOptions(kind) as option (option)}<option
        value={String(option)}>{label}：{formatCurrency(option)}</option
      >{/each}</Select
  >
  {#if limit && showUsage}
    <p
      class={`text-caption tabular-nums ${usage >= 1 ? "font-semibold text-coral" : "text-subtle"}`}
    >
      已用 {formatCurrency(spent)}，{spent <= limit
        ? `剩 ${formatCurrency(limit - spent)}`
        : `超過 ${formatCurrency(spent - limit)}`}
    </p>
  {:else if limit}
    <p class="text-caption text-subtle">每跨過 5,000 與每 10 天推播提醒</p>
  {/if}
  {#if save.isError}
    <p role="alert" class="text-caption text-coral">儲存失敗，請再試一次</p>
  {:else if budgets.data && !budgets.data.pushConfigured && limit}
    <p class="text-caption text-coral">推播尚未設定，額度不會通知</p>
  {/if}
</div>
