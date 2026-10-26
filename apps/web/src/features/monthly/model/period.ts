import type { StatementPeriod } from "@taiwan-fin-hub/shared";

export {
  PERIOD_START_DAY,
  periodKeyForDate,
  periodsMonthRange,
  recentPeriodKeys,
  shiftPeriodKey,
  statementPeriod,
  type StatementPeriod,
} from "@taiwan-fin-hub/shared";

export function formatPeriodLabel(key: string) {
  return `${key.slice(0, 4)} 年 ${Number(key.slice(5))} 月`;
}

export function formatPeriodRange(period: StatementPeriod) {
  const short = (date: string) =>
    `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  return `${short(period.start)}～${short(period.end)}`;
}
