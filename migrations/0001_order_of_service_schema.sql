CREATE TABLE IF NOT EXISTS service_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_statuses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS activity_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS hymn_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS hymns (
  id TEXT PRIMARY KEY,
  hymn_number TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL,
  lyrics_markdown TEXT NOT NULL DEFAULT '',
  music_key TEXT NOT NULL DEFAULT '',
  last_played TEXT NOT NULL DEFAULT '',
  times_played_last_6_months INTEGER NOT NULL DEFAULT 0,
  source_id TEXT NOT NULL REFERENCES hymn_sources(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hymns_name_idx ON hymns(name);
CREATE INDEX IF NOT EXISTS hymns_number_idx ON hymns(hymn_number);

CREATE TABLE IF NOT EXISTS order_service_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  service_type_id TEXT NOT NULL REFERENCES service_types(id),
  template_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS order_service_templates_service_type_idx
  ON order_service_templates(service_type_id);

CREATE TABLE IF NOT EXISTS orders_of_service (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  service_type_id TEXT NOT NULL REFERENCES service_types(id),
  service_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Planning' REFERENCES service_statuses(id),
  template_id TEXT REFERENCES order_service_templates(id),
  order_json TEXT NOT NULL,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS orders_of_service_date_idx ON orders_of_service(service_date);
CREATE INDEX IF NOT EXISTS orders_of_service_status_idx ON orders_of_service(status);

CREATE TABLE IF NOT EXISTS hymn_plays (
  id TEXT PRIMARY KEY,
  hymn_id TEXT NOT NULL REFERENCES hymns(id),
  order_id TEXT NOT NULL REFERENCES orders_of_service(id),
  played_on TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS hymn_plays_hymn_date_idx ON hymn_plays(hymn_id, played_on);

INSERT OR IGNORE INTO service_statuses (id, name) VALUES
  ('Planning', 'Planning'),
  ('Published', 'Published');

INSERT OR IGNORE INTO hymn_sources (id, name) VALUES
  ('living-hymns', 'Living Hymns'),
  ('other-hymn', 'Other Hymn'),
  ('song', 'Song'),
  ('majesty-hymns', 'Majesty Hymns');

INSERT OR IGNORE INTO activity_types (id, name, description) VALUES
  ('hymn', 'Hymn', 'Congregational hymn selected from the hymn library.'),
  ('prayer', 'Prayer', 'Prayer led by a selected person.'),
  ('scripture_reading', 'Scripture Reading', 'Bible passage read during service.'),
  ('hand_shaking', 'Hand Shaking', 'Fellowship greeting time.'),
  ('offertory', 'Offertory', 'Offering and offertory music.'),
  ('preaching', 'Preaching', 'Main preaching time.'),
  ('invitation', 'Invitation', 'Invitation following the message.'),
  ('special_music', 'Special Music', 'Special music selection.'),
  ('bible_preaching', 'Bible Preaching', 'Bible study or teaching time.'),
  ('custom', 'Custom', 'Custom activity.');

INSERT OR IGNORE INTO service_types (id, name, description) VALUES
  ('sunday-service', 'Sunday Service', 'Default Sunday service type.');

INSERT OR IGNORE INTO order_service_templates (id, name, service_type_id, template_json) VALUES
  (
    'default-sunday-service',
    'Sunday Service',
    'sunday-service',
    '{"name":"Sunday Service","service_type":[{"id":"sunday-school","typeName":"Sunday School","activities":[{"activityName":"Sunday School Hymn","activityType":"hymn","id":"sunday-school-hymn"},{"activityName":"Bible Study","activityType":"bible_preaching","id":"bible-study"}]},{"id":"sunday-main-service","typeName":"Sunday Main Service","activities":[{"activityName":"Opening Hymn","activityType":"hymn","id":"opening-hymn"},{"activityName":"Prayer","activityType":"prayer","id":"prayer"},{"activityName":"Scripture Reading","activityType":"scripture_reading","id":"scripture-reading"},{"activityName":"Offertory","activityType":"offertory","id":"offertory"},{"activityName":"Preaching","activityType":"preaching","id":"preaching"},{"activityName":"Invitation","activityType":"invitation","id":"invitation"}]},{"id":"sunday-evening-service","typeName":"Sunday Evening Service","activities":[{"activityName":"Congregational Hymn","activityType":"hymn","id":"evening-hymn"},{"activityName":"Special Music","activityType":"special_music","id":"special-music"},{"activityName":"Preaching","activityType":"preaching","id":"evening-preaching"}]}]}'
  );
