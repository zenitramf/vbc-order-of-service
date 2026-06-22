-- Column is added at runtime by ensureDatabase for both fresh and existing D1 databases.
-- Keep this migration as a no-op so Wrangler records it without failing when the
-- column already exists locally.
SELECT 1;
