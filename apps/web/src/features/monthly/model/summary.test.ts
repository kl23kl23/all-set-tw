import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@taiwan-fin-hub/shared";
import { rankCategories, summarizePeriods } from "./summary";

function item(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: "1",
    source: "card",
    date: "2026-10-20",
    title: "交易",
    subtitle: "",
    amount: -100,
    currency: "TWD",
    category: "餐飲",
    status: "posted",
    ...overrides,
  };
}

describe("period summary", () => {
  const items = [
    item({ id: "a", date: "2026-10-14", amount: -300, category: "交通" }),
    item({ id: "b", date: "2026-10-15", amount: -500 }),
    item({ id: "c", date: "2026-10-20", amount: -200 }),
    item({ id: "d", date: "2026-10-25", amount: 50000, category: "薪資" }),
    item({
      id: "e",
      source: "bank",
      date: "2026-10-21",
      amount: -3000,
      category: "轉帳",
      classificationRuleId: "system:bank:e-wallet-transfer",
    }),
    item({
      id: "g",
      source: "bank",
      date: "2026-10-23",
      amount: -120000,
      category: "投資",
      categoryId: "investment",
    }),
    item({
      id: "i",
      source: "bank",
      date: "2026-10-26",
      amount: -20,
      title: "抽籤扣款 處理費",
      category: "手續費",
      categoryId: "fee",
    }),
    item({
      id: "h",
      source: "bank",
      date: "2026-10-24",
      amount: 30000,
      category: "投資",
      categoryId: "investment",
    }),
    item({
      id: "f",
      source: "bank",
      date: "2026-10-22",
      amount: -8000,
      category: "轉帳",
      excludedFromCalculation: true,
      classificationRuleId: "system:bank:creditcard-payment",
    }),
  ];
  const summaries = summarizePeriods(items, ["2026-09", "2026-10"], {});

  it("splits spending by the 15th", () => {
    expect(summaries.get("2026-09")!.expense).toBe(300);
    expect(summaries.get("2026-10")!.expense).toBe(700);
    expect(summaries.get("2026-10")!.income).toBe(50000);
  });

  it("lists settlements, wallet top-ups and card payments apart from spending", () => {
    const october = summaries.get("2026-10")!;
    expect(october.investmentOut).toBe(120020);
    expect(october.investmentIn).toBe(30000);
    expect(october.topUp).toBe(3000);
    expect(october.cardPayment).toBe(8000);
    expect(october.spending.map((row) => row.id)).toEqual(["b", "c"]);
    expect(october.expense).toBe(700);
    expect(october.income).toBe(50000);
  });

  it("ranks categories across periods", () => {
    expect(rankCategories([...summaries.values()])).toEqual([
      { category: "餐飲", total: 700 },
      { category: "交通", total: 300 },
    ]);
  });
});
