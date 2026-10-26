import {
  activityCashFlow,
  activityDateKey,
  type ActivityItem,
} from "@taiwan-fin-hub/shared";
import {
  activityAmountTwd,
  activityFlowAmountTwd,
  activityFlowTotalTwd,
} from "@/features/activity/model/chart";
import { periodKeyForDate } from "./period";

/** System rules that mark money moved aside rather than spent. */
const TOP_UP_RULE = "system:bank:e-wallet-transfer";
const CARD_PAYMENT_RULE = "system:bank:creditcard-payment";

export type SetAsideKind = "top-up" | "card-payment";

export interface SetAsideRow {
  item: ActivityItem;
  kind: SetAsideKind;
  amount: number;
}

export interface PeriodSummary {
  key: string;
  income: number;
  expense: number;
  topUp: number;
  cardPayment: number;
  byCategory: Map<string, number>;
  spending: ActivityItem[];
  setAside: SetAsideRow[];
}

/** Money leaving a bank account into a wallet or a card bill: listed apart, not spent. */
export function setAsideKind(item: ActivityItem): SetAsideKind | null {
  if (item.source !== "bank" || (item.amount ?? 0) >= 0) return null;
  if (item.classificationRuleId === TOP_UP_RULE) return "top-up";
  if (item.classificationRuleId === CARD_PAYMENT_RULE) return "card-payment";
  return null;
}

export function summarizePeriods(
  items: ActivityItem[],
  keys: string[],
  rates: Record<string, number>,
): Map<string, PeriodSummary> {
  const grouped = new Map<string, ActivityItem[]>(keys.map((key) => [key, []]));
  for (const item of items) {
    grouped.get(periodKeyForDate(activityDateKey(item)))?.push(item);
  }

  return new Map(
    keys.map((key) => {
      const periodItems = grouped.get(key)!;
      const spending = periodItems.filter(
        (item) =>
          !item.excludedFromCalculation && activityCashFlow(item) === "expense",
      );
      const byCategory = new Map<string, number>();
      for (const item of spending)
        byCategory.set(
          item.category,
          (byCategory.get(item.category) ?? 0) +
            activityFlowAmountTwd(item, "expense", rates),
        );

      const setAside = periodItems.flatMap((item) => {
        const kind = setAsideKind(item);
        const amount = activityAmountTwd(item, rates);
        return kind && amount != null
          ? [{ item, kind, amount: Math.abs(amount) }]
          : [];
      });
      const setAsideTotal = (kind: SetAsideKind) =>
        setAside
          .filter((row) => row.kind === kind)
          .reduce((sum, row) => sum + row.amount, 0);

      return [
        key,
        {
          key,
          income: activityFlowTotalTwd(periodItems, "income", rates),
          expense: activityFlowTotalTwd(periodItems, "expense", rates),
          topUp: setAsideTotal("top-up"),
          cardPayment: setAsideTotal("card-payment"),
          byCategory,
          spending,
          setAside,
        },
      ];
    }),
  );
}

/** Categories across all periods, biggest total first. */
export function rankCategories(summaries: PeriodSummary[]) {
  const totals = new Map<string, number>();
  for (const summary of summaries)
    for (const [category, amount] of summary.byCategory)
      totals.set(category, (totals.get(category) ?? 0) + amount);
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, total]) => ({ category, total }));
}
