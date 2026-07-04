/**
 * Shared role/permission vocabulary for the User Admin page. This module is
 * imported by both client components and server functions, so it must stay free
 * of server-only imports.
 *
 * A role's permissions are stored on `roles.permissions` (see
 * ~/db/schema/roles) as a JSON object of `{ [resource]: action[] }`. The
 * built-in `admin` role uses the wildcard `{ "*": ["*"] }` to mean "everything".
 */

export const WILDCARD = "*";

export interface PermissionResource {
  actions: readonly string[];
  key: string;
  label: string;
}

/**
 * The resources and actions a role can be granted. This is the catalog the role
 * editor renders as a checkbox matrix.
 */
export const PERMISSION_RESOURCES: readonly PermissionResource[] = [
  {
    actions: ["view", "create", "update", "delete"],
    key: "orders",
    label: "Orders of Service",
  },
  {
    actions: ["view", "create", "update", "delete"],
    key: "templates",
    label: "Templates",
  },
  {
    actions: ["view", "create", "update", "delete"],
    key: "hymns",
    label: "Hymns",
  },
  {
    actions: ["view", "create", "update", "delete"],
    key: "teams",
    label: "Teams",
  },
  {
    actions: ["view", "create", "update", "delete"],
    key: "members",
    label: "Team Members",
  },
  { actions: ["view", "update"], key: "settings", label: "Settings" },
  {
    actions: ["view", "create", "update", "delete", "impersonate"],
    key: "users",
    label: "Users",
  },
  {
    actions: ["view", "create", "update", "delete"],
    key: "roles",
    label: "Roles",
  },
] as const;

export type RolePermissions = Record<string, string[]>;

export interface RoleRecord {
  createdAt: string;
  description: string;
  id: string;
  isSystem: boolean;
  name: string;
  permissions: RolePermissions;
  userCount: number;
}

export interface SaveRoleInput {
  description: string;
  id?: string;
  name: string;
  permissions: RolePermissions;
}

/** Parse the stored JSON permissions blob, tolerating malformed values. */
export const parsePermissions = (value: string): RolePermissions => {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    const result: RolePermissions = {};

    for (const [resource, actions] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (Array.isArray(actions)) {
        result[resource] = actions.filter(
          (action): action is string => typeof action === "string"
        );
      }
    }

    return result;
  } catch {
    return {};
  }
};

/** True when a role grants every permission (the `admin` wildcard). */
export const isWildcard = (permissions: RolePermissions): boolean =>
  permissions[WILDCARD]?.includes(WILDCARD) ?? false;

/** True when the given resource/action is granted by the permissions object. */
export const hasPermission = (
  permissions: RolePermissions,
  resource: string,
  action: string
): boolean => {
  if (isWildcard(permissions)) {
    return true;
  }

  return permissions[resource]?.includes(action) ?? false;
};

/** Total number of granted resource/action pairs, for summary display. */
export const countPermissions = (permissions: RolePermissions): number => {
  if (isWildcard(permissions)) {
    return PERMISSION_RESOURCES.reduce(
      (total, resource) => total + resource.actions.length,
      0
    );
  }

  return Object.values(permissions).reduce(
    (total, actions) => total + actions.length,
    0
  );
};
