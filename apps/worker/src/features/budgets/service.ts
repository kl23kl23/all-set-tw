import {
  buildActivityItems,
  deduplicateBankTransactions,
  isValidBudget,
  matchInvoicesToTransactions,
  periodKeyForDate,
  periodSpendingBySource,
  shiftPeriodKey,
  taipeiDateKey,
  type BudgetKind,
  type SpendingBudgetsResponse,
} from "@taiwan-fin-hub/shared";
import { sanitizeDatabaseError } from "../../db";
import type { Env } from "../../platform/env";
import { getBankRange } from "../bank/service";
import { getExchangeRates } from "../exchange-rates/service";
import { deliverPushPayload, isPushConfigured } from "../notifications/service";
import { planBudgetNotifications } from "./alerts";
import {
  deleteSpendingBudget,
  listSentBudgetAlerts,
  listSpendingBudgets,
  recordBudgetAlerts,
  saveSpendingBudget,
} from "./repository";

export class InvalidBudgetError extends Error {}

export async function getSpendingBudgets(
  env: Env,
): Promise<SpendingBudgetsResponse> {
  const budgets = await listSpendingBudgets(env.DB);
  return {
    budgets: {
      card: budgets.get("card") ?? null,
      account: budgets.get("account") ?? null,
    },
    pushConfigured: isPushConfigured(env),
  };
}

export async function setSpendingBudget(
  db: D1Database,
  kind: BudgetKind,
  monthlyLimit: number | null,
) {
  if (monthlyLimit == null) return deleteSpendingBudget(db, kind);
  if (!isValidBudget(kind, monthlyLimit))
    throw new InvalidBudgetError("Budget must be a 5,000 step within range.");
  await saveSpendingBudget(db, kind, monthlyLimit, new Date().toISOString());
}

/** Period spending from the same bank data and rules the pages use. */
async function currentPeriodSpending(db: D1Database, period: string) {
  const [bank, rates] = await Promise.all([
    getBankRange(db, {
      from: `${period}-01`,
      to: `${shiftPeriodKey(period, 2)}-01`,
    }),
    getExchangeRates(db).catch(() => []),
  ]);
  const accounts = new Map(
    bank.accounts.map((account) => [account.id, account]),
  );
  const transactions = deduplicateBankTransactions(
    bank.transactions.map((transaction) => ({
      ...transaction,
      accountType:
        transaction.accountType ??
        accounts.get(transaction.accountId)?.accountType,
    })),
  );
  const items = buildActivityItems(
    transactions,
    [],
    [],
    accounts,
    matchInvoicesToTransactions(transactions, [], []),
  );
  return periodSpendingBySource(
    items,
    period,
    Object.fromEntries(rates.map((rate) => [rate.currency, rate.rateTwd])),
  );
}

/**
 * Runs on every cron tick. Budget pushes are a convenience, so failures are
 * logged and never affect syncing; nothing is recorded as sent unless push is
 * configured, letting alerts go out once it is.
 */
export async function safelyCheckSpendingBudgets(env: Env, now = new Date()) {
  try {
    const budgets = await listSpendingBudgets(env.DB);
    if (budgets.size === 0 || !isPushConfigured(env)) return;
    const period = periodKeyForDate(taipeiDateKey(now));
    const [spent, sent] = await Promise.all([
      currentPeriodSpending(env.DB, period),
      listSentBudgetAlerts(env.DB, period),
    ]);
    for (const notification of planBudgetNotifications({
      period,
      now,
      budgets,
      spent,
      sent,
    })) {
      await deliverPushPayload(env, notification.payload);
      await recordBudgetAlerts(
        env.DB,
        period,
        notification.keys,
        now.toISOString(),
      );
    }
  } catch (error) {
    const safeError = sanitizeDatabaseError(error);
    console.error(
      JSON.stringify({
        event: "spending_budget_check_failed",
        message:
          safeError instanceof Error ? safeError.message : String(safeError),
      }),
    );
  }
}
