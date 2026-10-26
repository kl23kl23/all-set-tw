import { describe, expect, it } from "vitest";
import {
  periodSpendingBySource,
  type ActivityItem,
} from "@taiwan-fin-hub/shared";
import { planBudgetNotifications } from "../../../src/features/budgets/alerts";

const budgets = new Map([
  ["card", 20000],
  ["account", 10000],
] as const);

function plan(
  spent: { card: number; account: number },
  now: string,
  sent: string[] = [],
) {
  return planBudgetNotifications({
    period: "2026-10",
    now: new Date(now),
    budgets: new Map(budgets),
    spent,
    sent: new Set(sent),
  });
}

describe("budget notifications", () => {
  it("sends only the highest new 5,000 step and records every step it passed", () => {
    const [card] = plan({ card: 12000, account: 0 }, "2026-10-21T02:00:00Z");
    expect(card!.payload.title).toBe("信用卡刷卡已超過 NT$10,000");
    expect(card!.payload.body).toContain("剩 NT$8,000");
    expect(card!.keys).toEqual(["card:threshold:5000", "card:threshold:10000"]);
  });

  it("skips steps already sent and marks reaching the limit", () => {
    const sent = [
      "card:threshold:5000",
      "card:threshold:10000",
      "card:threshold:15000",
    ];
    const [card] = plan(
      { card: 21000, account: 0 },
      "2026-10-21T02:00:00Z",
      sent,
    );
    expect(card!.payload.title).toBe("信用卡刷卡已達每月額度");
    expect(card!.payload.body).toContain("超過 NT$1,000");
    expect(
      plan({ card: 14000, account: 0 }, "2026-10-21T02:00:00Z", sent),
    ).toEqual([]);
  });

  it("reports usage at 20:00 Taipei on period days 10, 20 and 30", () => {
    // 10/29 19:59 Taipei is before the day-10 report.
    expect(plan({ card: 0, account: 0 }, "2026-10-29T11:59:00Z")).toEqual([]);
    const [report] = plan(
      { card: 3000, account: 4000 },
      "2026-10-29T12:00:00Z",
    );
    expect(report!.keys).toEqual(["report:day10"]);
    expect(report!.payload.body).toBe(
      "信用卡刷卡已用 NT$3,000 / NT$20,000，剩 NT$17,000\n帳戶支出已用 NT$4,000 / NT$10,000，剩 NT$6,000",
    );
    const [late] = plan({ card: 0, account: 0 }, "2026-11-19T12:30:00Z", [
      "report:day10",
    ]);
    expect(late!.keys).toEqual([
      "report:day10",
      "report:day20",
      "report:day30",
    ]);
    expect(late!.payload.title).toContain("第 30 天");
  });
});

describe("period spending by source", () => {
  function item(overrides: Partial<ActivityItem>): ActivityItem {
    return {
      id: overrides.id ?? "1",
      source: "bank",
      date: "2026-10-20",
      title: "交易",
      subtitle: "",
      amount: -100,
      currency: "TWD",
      category: "未分類",
      status: "posted",
      ...overrides,
    };
  }

  it("splits card and account spending with the page rules", () => {
    const spent = periodSpendingBySource(
      [
        item({ id: "a", source: "card", amount: -1200 }),
        item({ id: "b", title: "全盈支付付款 PPPay", amount: -300 }),
        item({
          id: "c",
          title: "ATM現金 · 臺灣銀行",
          amount: -10000,
          categoryId: "transfer",
        }),
        item({ id: "d", title: "全國繳費 · 繳聯邦信用卡", amount: -60000 }),
        item({
          id: "e",
          title: "股票款",
          amount: -90000,
          categoryId: "investment",
        }),
        item({ id: "f", source: "card", amount: -500, date: "2026-10-19" }),
      ],
      "2026-10",
      {},
    );
    expect(spent).toEqual({ card: 1200, account: 10300 });
  });
});
