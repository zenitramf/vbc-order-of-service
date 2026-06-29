CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_team_id TEXT REFERENCES teams(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS teams_parent_idx ON teams(parent_team_id);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS team_members_name_idx
  ON team_members(last_name, first_name);

CREATE TABLE IF NOT EXISTS team_member_teams (
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES team_members(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (team_id, member_id)
);

CREATE INDEX IF NOT EXISTS team_member_teams_member_idx
  ON team_member_teams(member_id);

INSERT OR IGNORE INTO teams (id, name, parent_team_id) VALUES
  ('musicians', 'Musicians', NULL),
  ('singers', 'Singers', NULL),
  ('ushers', 'Ushers', NULL),
  ('counters', 'Counters', 'ushers'),
  ('pastors', 'Pastors', NULL),
  ('senior-pastor', 'Senior Pastor', 'pastors'),
  ('spanish-pastor', 'Spanish Pastor', 'pastors'),
  ('youth-pastor', 'Youth Pastor', 'pastors'),
  ('teachers', 'Teachers', NULL),
  ('childrens-teachers', 'Childrens', 'teachers'),
  ('teens-teachers', 'Teens', 'teachers'),
  ('young-adults-teachers', 'Young Adults', 'teachers'),
  ('song-leaders', 'Song Leaders', NULL);
