import { describe, expect, it } from "vitest";
import {
  formatPeriodRange,
  periodKeyForDate,
  periodsMonthRange,
  recentPeriodKeys,
  statementPeriod,
} from "./period";

describe("statement period", () => {
  it("starts a period on the 20th", () => {
    expect(periodKeyForDate("2026-10-19")).toBe("2026-09");
    expect(periodKeyForDate("2026-10-20")).toBe("2026-10");
    expect(periodKeyForDate("2026-11-19")).toBe("2026-10");
    expect(periodKeyForDate("2026-01-03")).toBe("2025-12");
  });

  it("spans the 20th to the 19th of the next month", () => {
    expect(statementPeriod("2026-10")).toEqual({
      key: "2026-10",
      start: "2026-10-20",
      end: "2026-11-19",
    });
    expect(statementPeriod("2026-12").end).toBe("2027-01-19");
    expect(formatPeriodRange(statementPeriod("2026-09"))).toBe("9/20～10/19");
  });

  it("loads every calendar month the periods touch", () => {
    const keys = recentPeriodKeys("2026-01", 3);
    expect(keys).toEqual(["2025-11", "2025-12", "2026-01"]);
    expect(periodsMonthRange(keys)).toEqual({ from: "2025-11", to: "2026-02" });
  });
});
