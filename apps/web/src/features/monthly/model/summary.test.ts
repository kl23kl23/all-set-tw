import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@taiwan-fin-hub/shared";
import {
  cashInvoiceSellers,
  rankCategories,
  setAsideKind,
  summarizePeriods,
} from "./summary";

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
    item({ id: "a", date: "2026-10-19", amount: -300, category: "交通" }),
    item({ id: "b", date: "2026-10-20", amount: -500 }),
    item({ id: "c", date: "2026-10-25", amount: -200 }),
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

  it("splits spending by the 20th", () => {
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

describe("bank wording", () => {
  const rows = [
    item({
      id: "p1",
      source: "bank",
      amount: -60010,
      title: "全國繳費 · 繳聯邦信用卡",
      category: "未分類",
      categoryId: "other",
    }),
    item({
      id: "p2",
      source: "bank",
      amount: -20000,
      title: "卡費",
      category: "轉帳",
      categoryId: "transfer",
    }),
    item({
      id: "p3",
      source: "card",
      amount: 73373,
      title: "網銀行動繳",
      category: "未分類",
      categoryId: "other",
    }),
    item({
      id: "p4",
      source: "card",
      amount: -66018,
      title: "ＣＵＢＥＡｐｐ跨轉繳款",
      category: "未分類",
      categoryId: "other",
    }),
    item({
      id: "c1",
      source: "bank",
      amount: -10000,
      title: "ATM現金 · 台新國際商業銀行",
      category: "轉帳",
      categoryId: "transfer",
    }),
    item({
      id: "f1",
      source: "bank",
      amount: -2500,
      title: "手機轉帳 · ****3382 給阿嬤買好吃的",
      category: "轉帳",
      categoryId: "transfer",
    }),
    item({
      id: "t1",
      source: "bank",
      amount: -50000,
      title: "手機轉帳 · ****8404貨款",
      category: "轉帳",
      categoryId: "transfer",
    }),
    ...Array.from({ length: 4 }, (_, n) =>
      item({
        id: `w${n}`,
        amount: -550,
        title: "全盈支付－全家",
        category: "未分類",
        categoryId: "other",
      }),
    ),
    item({
      id: "pp",
      source: "bank",
      amount: -239,
      title: "電子交易 · 全盈支付付款 PPPay",
      category: "未分類",
      categoryId: "other",
    }),
  ];
  const october = summarizePeriods(rows, ["2026-10"], {}).get("2026-10")!;
  const kinds = Object.fromEntries(
    october.setAside.map((row) => [row.item.id, row.kind]),
  );

  it("sets card bill payments aside whatever the bank calls them", () => {
    expect(kinds).toMatchObject({ p1: "card-payment", p2: "card-payment" });
    expect(setAsideKind(rows[2]!)).toBe("card-payment");
    expect(setAsideKind(rows[3]!)).toBe("card-payment");
    for (const title of ["富邦", "富邦１３１０１", "聯邦３４５８０１ "])
      expect(
        setAsideKind(
          item({ source: "bank", amount: -100, title, categoryId: "other" }),
        ),
      ).toBe("card-payment");
    expect(
      setAsideKind(
        item({
          source: "bank",
          amount: -100,
          title: "富邦momo購物",
          categoryId: "other",
        }),
      ),
    ).toBeNull();
    expect(
      setAsideKind(
        item({
          source: "bank",
          amount: -500,
          title: "LINE Pay Money",
          categoryId: "other",
        }),
      ),
    ).toBe("top-up");
    expect(october.cardPayment).toBe(60010 + 20000);
    expect(
      october.setAside.some(
        (row) => row.item.source === "card" && row.kind === "card-payment",
      ),
    ).toBe(false);
  });

  it("counts cash, bank-debited 全盈 and family transfers but sets other transfers aside", () => {
    expect(kinds.t1).toBe("transfer");
    expect(october.byCategory.get("現金")).toBe(10000 + 239);
    expect(october.byCategory.get("轉給家人")).toBe(2500);
  });

  it("counts repeated card charges at a wallet as purchases", () => {
    expect(october.topUp).toBe(0);
    expect(october.byCategory.get("未分類")).toBe(2200);
    expect(october.expense).toBe(10000 + 239 + 2500 + 2200);
  });
});

describe("cash invoices", () => {
  const rows = [
    item({
      id: "atm",
      source: "bank",
      amount: -10000,
      title: "ATM現金 · 台新",
      categoryId: "transfer",
      category: "轉帳",
    }),
    item({
      id: "i1",
      source: "invoice",
      amount: 55,
      title: "全家便利商店股份有限公司",
    }),
    item({
      id: "i2",
      source: "invoice",
      amount: 40,
      title: "全家便利商店股份有限公司",
    }),
    item({
      id: "i3",
      source: "invoice",
      amount: 1109,
      title: "禾富加油站股份有限公司",
    }),
  ];
  const october = summarizePeriods(rows, ["2026-10"], {}).get("2026-10")!;

  it("explains cash with unmatched invoices instead of counting them again", () => {
    expect(october.expense).toBe(10000);
    expect(october.spending.map((row) => row.id)).toEqual(["atm"]);
    expect(october.cashInvoiceTotal).toBe(1204);
  });

  it("groups cash invoices by seller", () => {
    const sellers = cashInvoiceSellers(october.cashInvoices, {});
    expect(
      sellers.map(({ seller, count, amount }) => [seller, count, amount]),
    ).toEqual([
      ["禾富加油站股份有限公司", 1, 1109],
      ["全家便利商店股份有限公司", 2, 95],
    ]);
    expect(sellers[1]!.invoices.map((row) => row.id)).toEqual(["i1", "i2"]);
  });
});

describe("card sellers", () => {
  it("keeps invoices from sellers marked as card out of cash", () => {
    const october = summarizePeriods(
      [
        item({
          id: "m1",
          source: "invoice",
          amount: 238,
          title: "和德昌股份有限公司",
        }),
        item({
          id: "f1",
          source: "invoice",
          amount: 55,
          title: "全家便利商店股份有限公司",
        }),
      ],
      ["2026-10"],
      {},
      new Set(["和德昌股份有限公司"]),
    ).get("2026-10")!;
    expect(october.cashInvoices.map((row) => row.id)).toEqual(["f1"]);
    expect(october.cardSellerInvoices.map((row) => row.id)).toEqual(["m1"]);
    expect(october.expense).toBe(0);
  });
});
