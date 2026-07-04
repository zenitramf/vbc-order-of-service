-- Give the built-in `user` role the standard app permissions so that enabling
-- per-resource permission enforcement does not lock out normal users. The
-- `admin` role keeps its wildcard; custom roles (e.g. "OOS Manager") stay
-- limited to whatever they were granted.

UPDATE roles
SET permissions = '{"orders":["view","create","update","delete"],"templates":["view","create","update","delete"],"hymns":["view","create","update","delete"],"teams":["view","create","update","delete"],"members":["view","create","update","delete"],"settings":["view","update"]}'
WHERE id = 'user';
