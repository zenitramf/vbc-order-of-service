-- Add hymn language (english | spanish), defaulting existing rows to english.
ALTER TABLE hymns ADD COLUMN language TEXT NOT NULL DEFAULT 'english' CHECK (language IN ('english', 'spanish'));

UPDATE hymns SET language = 'english' WHERE language IS NULL OR language = '';

CREATE INDEX hymns_language_idx ON hymns (language);
