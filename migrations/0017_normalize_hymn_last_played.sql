-- Convert legacy "Day, Mon D" values imported by the hymn seed to ISO 8601 dates.
-- The weekday uniquely identifies the intended year within the 2024–2026 data set.
WITH
  legacy_dates AS (
    SELECT
      id,
      CASE substr(last_played, 1, 3)
        WHEN 'Sun' THEN '0'
        WHEN 'Mon' THEN '1'
        WHEN 'Tue' THEN '2'
        WHEN 'Wed' THEN '3'
        WHEN 'Thu' THEN '4'
        WHEN 'Fri' THEN '5'
        WHEN 'Sat' THEN '6'
      END AS weekday,
      CASE substr(last_played, 6, 3)
        WHEN 'Jan' THEN 1
        WHEN 'Feb' THEN 2
        WHEN 'Mar' THEN 3
        WHEN 'Apr' THEN 4
        WHEN 'May' THEN 5
        WHEN 'Jun' THEN 6
        WHEN 'Jul' THEN 7
        WHEN 'Aug' THEN 8
        WHEN 'Sep' THEN 9
        WHEN 'Oct' THEN 10
        WHEN 'Nov' THEN 11
        WHEN 'Dec' THEN 12
      END AS month,
      CAST(substr(last_played, 10) AS INTEGER) AS day
    FROM hymns
    WHERE last_played <> '' AND last_played NOT GLOB '????-??-??'
  ),
  years(year) AS (VALUES (2024), (2025), (2026)),
  normalized_dates AS (
    SELECT
      legacy_dates.id,
      printf('%04d-%02d-%02d', years.year, legacy_dates.month, legacy_dates.day) AS last_played
    FROM legacy_dates
    JOIN years
      ON strftime(
        '%w',
        printf('%04d-%02d-%02d', years.year, legacy_dates.month, legacy_dates.day)
      ) = legacy_dates.weekday
  )
UPDATE hymns
SET last_played = (
  SELECT normalized_dates.last_played
  FROM normalized_dates
  WHERE normalized_dates.id = hymns.id
)
WHERE id IN (SELECT id FROM normalized_dates);
