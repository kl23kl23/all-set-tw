import {
  newBudgetThresholds,
  statementPeriod,
  type BudgetKind,
} from "@taiwan-fin-hub/shared";
import type { PushNotificationPayload } from "../notifications/payload";

/** Period days that get a usage report, each sent at 20:00 Taipei time. */
const REPORT_DAYS = [10, 20, 30] as const;
const REPORT_HOUR = 20;
const TAIPEI_OFFSET_MS = 8 * 60 * 60 * 1000;

const LABELS: Record<BudgetKind, string> = {
  card: "信用卡刷卡",
  account: "帳戶支出",
};
const PAGES: Record<BudgetKind, string> = {
  card: "/#/cards",
  account: "/#/monthly",
};

export type BudgetNotification = {
  payload: PushNotificationPayload;
  /** Alert keys this notification covers, recorded once it is sent. */
  keys: string[];
};

function money(value: number) {
  return `NT$${new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 0 }).format(Math.round(value))}`;
}

function periodName(period: string) {
  const { start, end } = statementPeriod(period);
  const short = (date: string) =>
    `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  return `${Number(period.slice(5))} 月份（${short(start)}～${short(end)}）`;
}

function usageLine(kind: BudgetKind, spent: number, limit: number) {
  const left = limit - spent;
  return `${LABELS[kind]}已用 ${money(spent)} / ${money(limit)}，${left >= 0 ? `剩 ${money(left)}` : `超過 ${money(-left)}`}`;
}

/** The Taipei moment a report day is due: that period day at 20:00. */
function reportDueAt(period: string, day: (typeof REPORT_DAYS)[number]) {
  const { start, end } = statementPeriod(period);
  const date =
    day === 30
      ? end
      : new Date(Date.parse(`${start}T00:00:00Z`) + (day - 1) * 86_400_000)
          .toISOString()
          .slice(0, 10);
  return Date.parse(`${date}T${REPORT_HOUR}:00:00Z`) - TAIPEI_OFFSET_MS;
}

/**
 * Push notifications due for one period: a message for the highest new
 * 5,000 step per budget, and the latest due usage report. Anything already
 * in `sent` is skipped, so the scheduler can call this on every tick.
 */
export function planBudgetNotifications({
  period,
  now,
  budgets,
  spent,
  sent,
}: {
  period: string;
  now: Date;
  budgets: Map<BudgetKind, number>;
  spent: Record<BudgetKind, number>;
  sent: ReadonlySet<string>;
}): BudgetNotification[] {
  const notifications: BudgetNotification[] = [];

  for (const [kind, limit] of budgets) {
    const alerted = new Set(
      [...sent]
        .filter((key) => key.startsWith(`${kind}:threshold:`))
        .map((key) => Number(key.split(":")[2])),
    );
    const thresholds = newBudgetThresholds(spent[kind], limit, alerted);
    const highest = thresholds.at(-1);
    if (highest == null) continue;
    notifications.push({
      payload: {
        title:
          highest >= limit
            ? `${LABELS[kind]}已達每月額度`
            : `${LABELS[kind]}已超過 ${money(highest)}`,
        body: `${periodName(period)}${usageLine(kind, spent[kind], limit)}。`,
        url: PAGES[kind],
        tag: `budget-${kind}-${period}`,
      },
      keys: thresholds.map((threshold) => `${kind}:threshold:${threshold}`),
    });
  }

  const dueReports = REPORT_DAYS.filter(
    (day) => now.getTime() >= reportDueAt(period, day),
  ).map((day) => `report:day${day}`);
  const latest = dueReports.at(-1);
  if (budgets.size > 0 && latest && !sent.has(latest)) {
    notifications.push({
      payload: {
        title: `${periodName(period)}第 ${latest.slice("report:day".length)} 天額度報告`,
        body: [...budgets]
          .map(([kind, limit]) => usageLine(kind, spent[kind], limit))
          .join("\n"),
        url: "/#/monthly",
        tag: `budget-report-${period}`,
      },
      keys: dueReports,
    });
  }

  return notifications;
}
