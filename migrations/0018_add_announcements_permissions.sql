-- Grant the built-in `user` role announcements permissions (view/create/update/
-- delete/approve). Admin keeps wildcard. Custom roles stay unchanged.

UPDATE roles
SET permissions = json_set(
  permissions,
  '$.announcements',
  json_array('view', 'create', 'update', 'delete', 'approve')
)
WHERE id = 'user';
