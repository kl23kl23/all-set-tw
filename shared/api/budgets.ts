import type { BudgetKind } from "../activity/statement-period";

/** `GET /api/budgets`：每月額度，未設定時為 null。 */
export interface SpendingBudgetsResponse {
  budgets: Record<BudgetKind, number | null>;
  /** 伺服器是否設定好推播金鑰；未設定時額度照存但不會通知。 */
  pushConfigured: boolean;
}

/** `PUT /api/budgets/:kind`；null 表示取消這項額度。 */
export interface SpendingBudgetInput {
  monthlyLimit: number | null;
}
