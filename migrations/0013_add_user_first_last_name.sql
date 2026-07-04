ALTER TABLE user ADD COLUMN first_name TEXT NOT NULL DEFAULT '';
ALTER TABLE user ADD COLUMN last_name TEXT NOT NULL DEFAULT '';

UPDATE user
SET
  first_name = CASE
    WHEN instr(trim(name), ' ') = 0 THEN trim(name)
    ELSE substr(trim(name), 1, instr(trim(name), ' ') - 1)
  END,
  last_name = CASE
    WHEN instr(trim(name), ' ') = 0 THEN ''
    ELSE trim(substr(trim(name), instr(trim(name), ' ') + 1))
  END
WHERE first_name = '' AND last_name = '';
