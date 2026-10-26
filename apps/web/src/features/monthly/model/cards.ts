import type { ActivityItem } from "@taiwan-fin-hub/shared";
import type { BankAccountRow, CreditCardBillRow } from "@/data/bank/types";
import { activityFlowAmountTwd } from "@/features/activity/model/chart";

export interface CardSummary {
  account: BankAccountRow;
  limit: number | null;
  /** Owed now per the bank: unpaid statement plus unbilled spending. */
  used: number | null;
  /** Share of the limit in use, 0–1; null when the bank gives no limit. */
  usage: number | null;
  periodSpend: number;
  periodItems: ActivityItem[];
  latestBill: CreditCardBillRow | null;
}

/**
 * Per-card view for one period. Card balances are stored as the negative
 * amount owed; the available credit, when the bank reports it, is the more
 * direct reading of what the limit has left.
 */
export function summarizeCards(
  accounts: BankAccountRow[],
  bills: CreditCardBillRow[],
  spending: ActivityItem[],
  accountOfTransaction: ReadonlyMap<string, string>,
  rates: Record<string, number>,
): CardSummary[] {
  return accounts
    .filter((account) => account.accountType === "credit")
    .map((account) => {
      const limit = account.creditLimit ?? null;
      const used =
        limit != null && account.availableBalance != null
          ? Math.max(limit - account.availableBalance, 0)
          : account.balance != null
            ? Math.max(-account.balance, 0)
            : null;
      const periodItems = spending.filter(
        (item) =>
          item.source === "card" &&
          accountOfTransaction.get(item.transactionId ?? item.id) ===
            account.id,
      );
      const latestBill =
        bills
          .filter((bill) => bill.accountId === account.id)
          .sort((a, b) => b.billingPeriod.localeCompare(a.billingPeriod))[0] ??
        null;
      return {
        account,
        limit,
        used,
        usage: limit && used != null ? used / limit : null,
        periodSpend: periodItems.reduce(
          (sum, item) => sum + activityFlowAmountTwd(item, "expense", rates),
          0,
        ),
        periodItems,
        latestBill,
      };
    })
    .sort((a, b) => b.periodSpend - a.periodSpend);
}
