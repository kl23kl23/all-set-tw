-- 每月額度：信用卡刷卡與銀行帳戶支出各一筆，期別為每月 15 日起算。
CREATE TABLE spending_budgets (
  kind TEXT NOT NULL CHECK (kind IN ('card', 'account')),
  monthly_limit INTEGER NOT NULL CHECK (monthly_limit > 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (kind)
);

-- 已送出的額度推播，同一期同一則只送一次。
CREATE TABLE spending_budget_alerts (
  period TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (period, alert_key)
);
