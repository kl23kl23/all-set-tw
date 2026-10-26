import { activityCashFlow, activityDisplayAmount } from "./flow";
import { activityDateKey } from "./list";
import type { ActivityItem } from "./types";

/**
 * Monthly statement periods that start on the 15th, and the rules that decide
 * which activity counts as spending in them. The 月份收支 and 信用卡 pages and
 * the Worker's spending alerts share these so their totals agree.
 */

/** Day of month a period starts; it ends the day before the next one. */
export const PERIOD_START_DAY = 15;

export interface StatementPeriod {
  /** `YYYY-MM` of the month the period starts in, e.g. 2026-10 = 10/15～11/14. */
  key: string;
  start: string;
  end: string;
}

/** Period key for a `YYYY-MM-DD` Taipei date key. */
export function periodKeyForDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return day! >= PERIOD_START_DAY
    ? monthKey(year!, month!)
    : monthKey(year!, month! - 1);
}

export function statementPeriod(key: string): StatementPeriod {
  const [year, month] = key.split("-").map(Number);
  return {
    key,
    start: `${monthKey(year!, month!)}-${pad(PERIOD_START_DAY)}`,
    end: `${monthKey(year!, month! + 1)}-${pad(PERIOD_START_DAY - 1)}`,
  };
}

export function shiftPeriodKey(key: string, offset: number) {
  const [year, month] = key.split("-").map(Number);
  return monthKey(year!, month! + offset);
}

/** The latest `count` period keys ending at `current`, oldest first. */
export function recentPeriodKeys(current: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    shiftPeriodKey(current, index - count + 1),
  );
}

/** Calendar months (`YYYY-MM`) that cover the given periods. */
export function periodsMonthRange(keys: string[]) {
  return { from: keys[0]!, to: shiftPeriodKey(keys.at(-1)!, 1) };
}

function monthKey(year: number, month: number) {
  const date = new Date(Date.UTC(year, month - 1, 1));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** System rules that mark money moved aside rather than spent. */
const TOP_UP_RULE = "system:bank:e-wallet-transfer";
const CARD_PAYMENT_RULES = new Set([
  "system:bank:creditcard-payment",
  "system:bank:card-payment-received",
]);
const INVESTMENT_CATEGORY = "investment";
const TRANSFER_CATEGORY = "transfer";
/** IPO lottery debits, fees and refunds; banks rarely tag them as investments. */
const STOCK_LOTTERY = /抽籤|申購|中籤/;
/** Bank debits that settle a card bill, however each bank words it. */
const BANK_CARD_PAYMENT = /信用卡|卡費|卡款/;
/** Card-side entries for a bill payment; some banks post them with either sign. */
const CARD_SIDE_PAYMENT = /繳款|繳費網|行動繳|跨行轉帳|ATM轉帳|自扣/;
/** A debit memo that is only a card issuer's name, e.g. 富邦１３１０１, pays its card. */
const ISSUER_ONLY_MEMO =
  /^(聯邦|富邦|北富銀|國泰|中信|玉山|星展|永豐|台新|第一|華南|兆豐)[\s\d０-９]*$/;
/** Moving money into an e-wallet balance from the bank. */
const BANK_TOP_UP = /line\s?pay\s?money/i;
const CASH_WITHDRAWAL = /ATM現金|現金提款|提款機/;
/** A transfer that names someone it is for, such as 給阿嬤, is money spent. */
const SPENT_TRANSFER = /給/;
const E_WALLET = /全盈|全支付|街口|悠遊付|icash\s?pay|line\s?pay/i;
/** Identical wallet charges this many times in a day are a batch of top-ups. */
const BATCH_TOP_UP_COUNT = 3;

export const CASH_CATEGORY = "現金提領";
export const FAMILY_CATEGORY = "轉給家人";

export type SetAsideKind =
  "investment" | "top-up" | "card-payment" | "transfer";

function itemText(item: ActivityItem) {
  return `${item.title} ${item.searchText ?? ""}`;
}

function batchKey(item: ActivityItem) {
  return `${activityDateKey(item)}|${item.amount}|${item.title}`;
}

/** Card charges repeated at an e-wallet on one day, the shape of batch top-ups. */
export function findBatchTopUps(items: ActivityItem[]) {
  const counts = new Map<string, number>();
  for (const item of items)
    if (item.source === "card" && E_WALLET.test(item.title))
      counts.set(batchKey(item), (counts.get(batchKey(item)) ?? 0) + 1);
  return new Set(
    [...counts].filter(([, n]) => n >= BATCH_TOP_UP_COUNT).map(([key]) => key),
  );
}

/**
 * Entries that move money elsewhere instead of buying something: stock
 * settlements and IPO lotteries, wallet top-ups, card bill payments and
 * transfers without a stated purpose. The periods list them apart even when
 * the activity page still counts them.
 */
export function setAsideKind(
  item: ActivityItem,
  batchTopUps: ReadonlySet<string> = new Set(),
): SetAsideKind | null {
  if (!item.amount) return null;
  const text = itemText(item);
  if (item.source === "card") {
    if (
      CARD_PAYMENT_RULES.has(item.classificationRuleId ?? "") ||
      CARD_SIDE_PAYMENT.test(text)
    )
      return "card-payment";
    if (batchTopUps.has(batchKey(item))) return "top-up";
    return null;
  }
  if (item.source !== "bank") return null;
  if (item.categoryId === INVESTMENT_CATEGORY || STOCK_LOTTERY.test(text))
    return "investment";
  if (item.amount < 0) {
    if (item.classificationRuleId === TOP_UP_RULE || BANK_TOP_UP.test(text))
      return "top-up";
    if (
      CARD_PAYMENT_RULES.has(item.classificationRuleId ?? "") ||
      BANK_CARD_PAYMENT.test(text) ||
      ISSUER_ONLY_MEMO.test(item.title.trim())
    )
      return "card-payment";
    if (CASH_WITHDRAWAL.test(text) || SPENT_TRANSFER.test(text)) return null;
  }
  if (item.categoryId === TRANSFER_CATEGORY) return "transfer";
  return null;
}

/** Cash and family transfers count as spending under their own category. */
export function spendingCategory(item: ActivityItem): ActivityItem {
  if (item.source !== "bank" || (item.amount ?? 0) >= 0) return item;
  const text = itemText(item);
  if (CASH_WITHDRAWAL.test(text)) return { ...item, category: CASH_CATEGORY };
  if (item.categoryId === TRANSFER_CATEGORY && SPENT_TRANSFER.test(text))
    return { ...item, category: FAMILY_CATEGORY };
  return item;
}

/** Spending in TWD, with refunds negative; undefined without an exchange rate. */
export function spendingAmountTwd(
  item: ActivityItem,
  rates: Record<string, number>,
) {
  const amount = activityDisplayAmount(item);
  if (amount == null || activityCashFlow(item) !== "expense") return 0;
  const rate = item.currency === "TWD" ? 1 : rates[item.currency];
  return rate != null && Number.isFinite(rate) && rate > 0
    ? -amount * rate
    : undefined;
}

export type BudgetKind = "card" | "account";

export const BUDGET_STEP = 5000;
export const BUDGET_MAX: Record<BudgetKind, number> = {
  card: 30000,
  account: 20000,
};

export function budgetOptions(kind: BudgetKind) {
  return Array.from(
    { length: BUDGET_MAX[kind] / BUDGET_STEP },
    (_, index) => (index + 1) * BUDGET_STEP,
  );
}

export function isValidBudget(kind: BudgetKind, limit: number) {
  return budgetOptions(kind).includes(limit);
}

/**
 * Period spending that the budgets watch: card spending, and money spent
 * straight from bank accounts (wallet payments, cash, family transfers, bills).
 */
export function periodSpendingBySource(
  items: ActivityItem[],
  periodKey: string,
  rates: Record<string, number>,
): Record<BudgetKind, number> {
  const batchTopUps = findBatchTopUps(items);
  const totals: Record<BudgetKind, number> = { card: 0, account: 0 };
  for (const item of items) {
    if (item.source !== "card" && item.source !== "bank") continue;
    if (item.excludedFromCalculation) continue;
    if (periodKeyForDate(activityDateKey(item)) !== periodKey) continue;
    if (setAsideKind(item, batchTopUps)) continue;
    totals[item.source === "card" ? "card" : "account"] +=
      spendingAmountTwd(item, rates) ?? 0;
  }
  return totals;
}

/**
 * The 5,000 steps up to the limit that spending has reached but no alert has
 * covered yet. Alerts send only the highest one, so a jump past several steps
 * between checks sends a single message.
 */
export function newBudgetThresholds(
  spent: number,
  limit: number,
  alerted: ReadonlySet<number>,
) {
  return Array.from(
    { length: Math.floor(limit / BUDGET_STEP) },
    (_, index) => (index + 1) * BUDGET_STEP,
  ).filter((threshold) => spent >= threshold && !alerted.has(threshold));
}
