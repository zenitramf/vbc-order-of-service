-- Announcements and the image library were removed from the portal. Strip
-- their permission keys from every role that still grants them (the built-in
-- `user` role got announcements in 0018 and library in 0019; custom roles may
-- grant either). The admin wildcard {"*": ["*"]} has neither key and is
-- unaffected.

UPDATE roles
SET permissions = json_remove(permissions, '$.announcements', '$.library')
WHERE json_extract(permissions, '$.announcements') IS NOT NULL
   OR json_extract(permissions, '$.library') IS NOT NULL;
