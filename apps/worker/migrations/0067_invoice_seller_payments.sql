-- 使用者標記「這家通常刷卡」的發票店家；這些店家的未配對發票不列為現金用途。
CREATE TABLE invoice_seller_payments (
  seller_name TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('card')),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (seller_name)
);
