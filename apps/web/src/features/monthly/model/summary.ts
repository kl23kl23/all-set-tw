import {
  activityCashFlow,
  activityDateKey,
  periodKeyForDate,
  setAsideKind,
  spendingCategory,
  type ActivityItem,
  type SetAsideKind,
} from "@taiwan-fin-hub/shared";
import {
  activityAmountTwd,
  activityFlowAmountTwd,
} from "@/features/activity/model/chart";

export {
  CASH_CATEGORY,
  FAMILY_CATEGORY,
  setAsideKind,
  type SetAsideKind,
} from "@taiwan-fin-hub/shared";

export interface SetAsideRow {
  item: ActivityItem;
  kind: SetAsideKind;
  /** Signed TWD amount: negative leaves the account, positive arrives. */
  amount: number;
}

export interface PeriodSummary {
  key: string;
  income: number;
  /** Spending outside investments, wallet top-ups, card payments and transfers. */
  expense: number;
  investmentOut: number;
  investmentIn: number;
  topUp: number;
  cardPayment: number;
  transferOut: number;
  byCategory: Map<string, number>;
  spending: ActivityItem[];
  setAside: SetAsideRow[];
  /**
   * Invoices no card or bank entry claimed. They are mostly bought with cash,
   * which already counts when withdrawn, so they explain the cash instead of
   * adding to spending.
   */
  cashInvoices: ActivityItem[];
  cashInvoiceTotal: number;
  /** Unmatched invoices from sellers marked as usually paid by card. */
  cardSellerInvoices: ActivityItem[];
}

export interface CashInvoiceSeller {
  seller: string;
  count: number;
  amount: number;
  /** Newest first. */
  invoices: ActivityItem[];
}

export function summarizePeriods(
  items: ActivityItem[],
  keys: string[],
  rates: Record<string, number>,
  cardSellers: ReadonlySet<string> = new Set(),
): Map<string, PeriodSummary> {
  const grouped = new Map<string, ActivityItem[]>(keys.map((key) => [key, []]));
  for (const item of items) {
    grouped.get(periodKeyForDate(activityDateKey(item)))?.push(item);
  }

  return new Map(
    keys.map((key) => {
      const setAside: SetAsideRow[] = [];
      const counted: ActivityItem[] = [];
      const cashInvoices: ActivityItem[] = [];
      const cardSellerInvoices: ActivityItem[] = [];
      for (const item of grouped.get(key)!) {
        if (item.source === "invoice") {
          // A card-paid invoice counts once its card entry syncs, not as cash.
          (cardSellers.has(item.title)
            ? cardSellerInvoices
            : cashInvoices
          ).push(item);
          continue;
        }
        const kind = setAsideKind(item);
        const amount = activityAmountTwd(item, rates);
        if (!kind) counted.push(spendingCategory(item));
        // The bank side already lists the payment; the card side would repeat it.
        else if (kind === "card-payment" && item.source === "card") continue;
        else if (amount != null) setAside.push({ item, kind, amount });
      }

      const spending = counted.filter(
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
      const flowTotal = (flow: "income" | "expense") =>
        counted.reduce(
          (sum, item) => sum + activityFlowAmountTwd(item, flow, rates),
          0,
        );
      const setAsideTotal = (kind: SetAsideKind, sign: 1 | -1 = -1) =>
        setAside
          .filter((row) => row.kind === kind && Math.sign(row.amount) === sign)
          .reduce((sum, row) => sum + Math.abs(row.amount), 0);

      return [
        key,
        {
          key,
          income: flowTotal("income"),
          expense: flowTotal("expense"),
          investmentOut: setAsideTotal("investment"),
          investmentIn: setAsideTotal("investment", 1),
          topUp: setAsideTotal("top-up"),
          cardPayment: setAsideTotal("card-payment"),
          transferOut: setAsideTotal("transfer"),
          byCategory,
          spending,
          setAside,
          cashInvoices,
          cardSellerInvoices,
          cashInvoiceTotal: cashInvoices.reduce(
            (sum, item) => sum + activityFlowAmountTwd(item, "expense", rates),
            0,
          ),
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

/** Cash invoices grouped by seller, biggest total first. */
export function cashInvoiceSellers(
  invoices: ActivityItem[],
  rates: Record<string, number>,
): CashInvoiceSeller[] {
  const sellers = new Map<string, CashInvoiceSeller>();
  for (const item of invoices) {
    const seller = sellers.get(item.title) ?? {
      seller: item.title,
      count: 0,
      amount: 0,
      invoices: [],
    };
    seller.count += 1;
    seller.invoices.push(item);
    seller.amount += activityFlowAmountTwd(item, "expense", rates);
    sellers.set(item.title, seller);
  }
  for (const seller of sellers.values())
    seller.invoices.sort((a, b) => b.date.localeCompare(a.date));
  return [...sellers.values()].sort((a, b) => b.amount - a.amount);
}
