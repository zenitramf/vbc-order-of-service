import type { RolePermissions } from "~/lib/admin-permissions";
import { hasPermission } from "~/lib/admin-permissions";
import type { McpCaller } from "~/mcp/auth";
import { McpAuthError } from "~/mcp/auth";

export const requireMcpPermission = (
  caller: McpCaller,
  resource: string,
  action: string
): void => {
  if (!hasPermission(caller.permissions, resource, action)) {
    throw new McpAuthError(
      `Permission denied: ${resource}:${action} is required.`,
      403
    );
  }
};

/** Narrow helper when a tool only needs the permission check side effect. */
export const assertCan = (
  permissions: RolePermissions,
  resource: string,
  action: string
): void => {
  if (!hasPermission(permissions, resource, action)) {
    throw new McpAuthError(
      `Permission denied: ${resource}:${action} is required.`,
      403
    );
  }
};
