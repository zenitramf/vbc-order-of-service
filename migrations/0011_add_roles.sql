-- Application roles for the User Admin page (see src/db/schema/roles.ts).
-- Applied by `wrangler d1 migrations apply` (the single migration executor).

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '{}',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Built-in roles. Uneditable in the UI (is_system = 1). `admin` grants every
-- permission via the wildcard; `user` is the default authenticated role.
INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system)
VALUES
  ('admin', 'Admin', 'Full access to every area, including user and role management.', '{"*":["*"]}', 1),
  ('user', 'User', 'Standard authenticated access to plan and manage services.', '{}', 1);

-- Ensure the local owner account can reach the User Admin page.
UPDATE user SET role = 'admin' WHERE email = 'francisco@zenitram.dev';
