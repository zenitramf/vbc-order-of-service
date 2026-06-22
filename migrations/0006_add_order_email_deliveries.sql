CREATE TABLE IF NOT EXISTS order_email_deliveries (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL UNIQUE REFERENCES orders_of_service(id),
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Queued',
  queued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at TEXT,
  error_message TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_email_deliveries_order_idx
  ON order_email_deliveries(order_id);
