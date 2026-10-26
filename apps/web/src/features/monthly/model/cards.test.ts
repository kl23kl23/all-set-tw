import { describe, expect, it } from "vitest";
import type { ActivityItem } from "@taiwan-fin-hub/shared";
import type { BankAccountRow } from "@/data/bank/types";
import { summarizeCards } from "./cards";

function card(overrides: Partial<BankAccountRow>): BankAccountRow {
  return {
    id: "card-a",
    connectorId: "ubot",
    sourceId: "a",
    accountType: "credit",
    currency: "TWD",
    ...overrides,
  };
}

function spend(id: string, amount: number): ActivityItem {
  return {
    id,
    transactionId: id,
    source: "card",
    date: "2026-10-20",
    title: "消費",
    subtitle: "",
    amount,
    currency: "TWD",
    category: "餐飲",
    status: "posted",
  };
}

describe("card summary", () => {
  const accounts = [
    card({ id: "card-a", creditLimit: 100000, availableBalance: 70000 }),
    card({ id: "card-b", balance: -5000 }),
    card({ id: "checking", accountType: "checking" }),
  ];
  const owners = new Map([
    ["t1", "card-a"],
    ["t2", "card-a"],
    ["t3", "card-b"],
  ]);
  const cards = summarizeCards(
    accounts,
    [],
    [
      spend("t1", -1200),
      { ...spend("t2", 200), refund: true },
      spend("t3", -300),
    ],
    owners,
    {},
  );

  it("reads used credit from the available credit when both are known", () => {
    expect(cards[0]!.account.id).toBe("card-a");
    expect(cards[0]!.used).toBe(30000);
    expect(cards[0]!.usage).toBe(0.3);
  });

  it("falls back to the owed balance when the bank gives no limit", () => {
    expect(cards[1]!.used).toBe(5000);
    expect(cards[1]!.usage).toBeNull();
  });

  it("nets refunds into the period spend of their card", () => {
    expect(cards[0]!.periodSpend).toBe(1000);
    expect(cards[1]!.periodSpend).toBe(300);
    expect(cards).toHaveLength(2);
  });
});
