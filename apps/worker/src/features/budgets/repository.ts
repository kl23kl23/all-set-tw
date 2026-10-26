import type { BudgetKind } from "@taiwan-fin-hub/shared";
import { eq } from "drizzle-orm";
import { createDrizzle, spendingBudgetAlerts, spendingBudgets } from "../../db";

export async function listSpendingBudgets(db: D1Database) {
  const rows = await createDrizzle(db)
    .select({
      kind: spendingBudgets.kind,
      monthlyLimit: spendingBudgets.monthlyLimit,
    })
    .from(spendingBudgets)
    .all();
  return new Map(rows.map((row) => [row.kind as BudgetKind, row.monthlyLimit]));
}

export async function saveSpendingBudget(
  db: D1Database,
  kind: BudgetKind,
  monthlyLimit: number,
  now: string,
) {
  await createDrizzle(db)
    .insert(spendingBudgets)
    .values({ kind, monthlyLimit, updatedAt: now })
    .onConflictDoUpdate({
      target: spendingBudgets.kind,
      set: { monthlyLimit, updatedAt: now },
    })
    .run();
}

export async function deleteSpendingBudget(db: D1Database, kind: BudgetKind) {
  await createDrizzle(db)
    .delete(spendingBudgets)
    .where(eq(spendingBudgets.kind, kind))
    .run();
}

export async function listSentBudgetAlerts(db: D1Database, period: string) {
  const rows = await createDrizzle(db)
    .select({ alertKey: spendingBudgetAlerts.alertKey })
    .from(spendingBudgetAlerts)
    .where(eq(spendingBudgetAlerts.period, period))
    .all();
  return new Set(rows.map((row) => row.alertKey));
}

export async function recordBudgetAlerts(
  db: D1Database,
  period: string,
  alertKeys: string[],
  now: string,
) {
  if (alertKeys.length === 0) return;
  await createDrizzle(db)
    .insert(spendingBudgetAlerts)
    .values(alertKeys.map((alertKey) => ({ period, alertKey, sentAt: now })))
    .onConflictDoNothing()
    .run();
}
