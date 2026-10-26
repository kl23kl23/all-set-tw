import { queryOptions } from "@tanstack/svelte-query";
import type { SpendingBudgetsResponse } from "@taiwan-fin-hub/shared";
import type { ApiClient } from "@/shared/api/client";
import { queryKeys } from "@/shared/api/query-keys";

type ApiProvider = () => ApiClient;

export const spendingBudgetsQuery = (getApi: ApiProvider) =>
  queryOptions({
    queryKey: queryKeys.budgets,
    queryFn: () => getApi().get<SpendingBudgetsResponse>("/api/budgets"),
  });
