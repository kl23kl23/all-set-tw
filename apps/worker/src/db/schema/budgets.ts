import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// SQL migrations remain authoritative for schema shape and constraints.

export const spendingBudgets = sqliteTable(
  "spending_budgets",
  {
    kind: text("kind").notNull(),
    monthlyLimit: integer("monthly_limit").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.kind] })],
);

export const spendingBudgetAlerts = sqliteTable(
  "spending_budget_alerts",
  {
    period: text("period").notNull(),
    alertKey: text("alert_key").notNull(),
    sentAt: text("sent_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.period, table.alertKey] })],
);

export const invoiceSellerPayments = sqliteTable(
  "invoice_seller_payments",
  {
    sellerName: text("seller_name").notNull(),
    method: text("method").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [primaryKey({ columns: [table.sellerName] })],
);
