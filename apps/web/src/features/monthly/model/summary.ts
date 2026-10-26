import {
  activityCashFlow,
  activityDateKey,
  type ActivityItem,
} from "@taiwan-fin-hub/shared";
import {
  activityAmountTwd,
  activityFlowAmountTwd,
} from "@/features/activity/model/chart";
import { periodKeyForDate } from "./period";

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
}

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
 * transfers without a stated purpose. The period lists them apart even when
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
function spendingCategory(item: ActivityItem) {
  if (item.source !== "bank" || (item.amount ?? 0) >= 0) return item;
  const text = itemText(item);
  if (CASH_WITHDRAWAL.test(text)) return { ...item, category: CASH_CATEGORY };
  if (item.categoryId === TRANSFER_CATEGORY && SPENT_TRANSFER.test(text))
    return { ...item, category: FAMILY_CATEGORY };
  return item;
}

export function summarizePeriods(
  items: ActivityItem[],
  keys: string[],
  rates: Record<string, number>,
): Map<string, PeriodSummary> {
  const batchTopUps = findBatchTopUps(items);
  const grouped = new Map<string, ActivityItem[]>(keys.map((key) => [key, []]));
  for (const item of items) {
    grouped.get(periodKeyForDate(activityDateKey(item)))?.push(item);
  }

  return new Map(
    keys.map((key) => {
      const setAside: SetAsideRow[] = [];
      const counted: ActivityItem[] = [];
      for (const item of grouped.get(key)!) {
        const kind = setAsideKind(item, batchTopUps);
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
