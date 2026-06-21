CREATE UNIQUE INDEX IF NOT EXISTS orders_of_service_service_date_unique_idx
  ON orders_of_service(service_date);
