-- Grant the built-in `user` role image library permissions (view/create/delete).
-- Admin keeps wildcard. Custom roles stay unchanged.

UPDATE roles
SET permissions = json_set(
  permissions,
  '$.library',
  json_array('view', 'create', 'delete')
)
WHERE id = 'user';
