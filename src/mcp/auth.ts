import type { RolePermissions } from "~/lib/admin-permissions";

/** Authenticated MCP caller resolved from the Bearer token gate. */
export interface McpCaller {
  /** How the caller was authenticated. */
  mode: "bearer" | "dev-open";
  permissions: RolePermissions;
  /** Stable id for audit/logging (not a Better Auth user id yet). */
  subject: string;
}

export class McpAuthError extends Error {
  readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "McpAuthError";
    this.status = status;
  }
}

interface McpEnv {
  MCP_API_TOKEN?: string;
}

/**
 * Authenticate an MCP request.
 *
 * - When `MCP_API_TOKEN` is set, require `Authorization: Bearer <token>`.
 * - When unset (local/dev), allow access with wildcard permissions so Inspector
 *   can connect without secrets. Production must set the secret.
 *
 * MVP token callers receive admin wildcard permissions. A later OAuth bridge
 * will map to Better Auth users and role matrices.
 */
export const authenticateMcpRequest = (
  request: Request,
  env: McpEnv
): McpCaller => {
  const expected = env.MCP_API_TOKEN?.trim();

  if (!expected) {
    return {
      mode: "dev-open",
      permissions: { "*": ["*"] },
      subject: "mcp-dev-open",
    };
  }

  const header = request.headers.get("Authorization");

  if (!header?.startsWith("Bearer ")) {
    throw new McpAuthError(
      "Missing Authorization Bearer token for MCP access."
    );
  }

  const token = header.slice("Bearer ".length).trim();

  if (token !== expected) {
    throw new McpAuthError("Invalid MCP API token.");
  }

  return {
    mode: "bearer",
    permissions: { "*": ["*"] },
    subject: "mcp-bearer",
  };
};
