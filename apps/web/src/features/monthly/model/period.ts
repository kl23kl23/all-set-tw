import type { MonthRange } from "@/shared/date-range";

/** Day of month a statement period starts; the period ends the day before next month. */
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

/** Calendar months the API must load to cover the given periods. */
export function periodsMonthRange(keys: string[]): MonthRange {
  return { from: keys[0]!, to: shiftPeriodKey(keys.at(-1)!, 1) };
}

export function formatPeriodLabel(key: string) {
  return `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;
}

export function formatPeriodRange(period: StatementPeriod) {
  const short = (date: string) =>
    `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  return `${short(period.start)}～${short(period.end)}`;
}

function monthKey(year: number, month: number) {
  const date = new Date(year, month - 1, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
