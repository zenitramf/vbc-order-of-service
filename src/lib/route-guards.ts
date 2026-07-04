import { redirect } from "@tanstack/react-router";

import type { RolePermissions } from "~/lib/admin-permissions";
import { hasPermission } from "~/lib/admin-permissions";

/**
 * Route `beforeLoad` guard: send users who lack the given resource/action back
 * to the dashboard (which every authenticated user can see). The `admin` role's
 * wildcard permissions satisfy every check.
 */
export const requirePermission = (
  permissions: RolePermissions,
  resource: string,
  action: string
): void => {
  if (!hasPermission(permissions, resource, action)) {
    throw redirect({ to: "/" });
  }
};
