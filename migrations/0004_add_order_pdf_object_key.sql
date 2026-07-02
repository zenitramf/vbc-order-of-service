-- Adds the published-PDF object key to orders_of_service.
--
-- This was previously a no-op because the now-removed runtime `ensureDatabase()`
-- added the column via ALTER on every request. With that bootstrap gone,
-- migrations own the schema, so this migration does the real ALTER for fresh
-- databases. Existing databases (production and any local DB that already ran
-- `ensureDatabase`) have this migration recorded as applied in `d1_migrations`,
-- so Wrangler will not re-run it and cannot hit a duplicate-column error.
ALTER TABLE orders_of_service ADD COLUMN pdf_object_key TEXT;
