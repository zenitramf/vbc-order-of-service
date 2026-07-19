import { createMcpHandler } from "agents/mcp";

import { authenticateMcpRequest, McpAuthError } from "~/mcp/auth";
import { createVbcMcpServer } from "~/mcp/server";

const MCP_ROUTE = "/mcp";

type WorkerEnv = Env & {
  MCP_API_TOKEN?: string;
};

/** True when the request should be handled by the MCP server. */
export const isMcpRequest = (request: Request): boolean => {
  const { pathname } = new URL(request.url);
  return pathname === MCP_ROUTE || pathname.startsWith(`${MCP_ROUTE}/`);
};

/**
 * Authenticate and serve Streamable HTTP MCP on `/mcp`.
 * Creates a new McpServer per request (required for stateless MCP SDK ≥ 1.26).
 */
export const handleMcpRequest = (
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext
): Promise<Response> => {
  try {
    const caller = authenticateMcpRequest(request, env);
    const server = createVbcMcpServer(caller);
    return createMcpHandler(server, { route: MCP_ROUTE })(request, env, ctx);
  } catch (error) {
    if (error instanceof McpAuthError) {
      return Promise.resolve(
        Response.json(
          { error: error.message },
          {
            headers: {
              "www-authenticate": 'Bearer realm="vbc-mcp"',
            },
            status: error.status,
          }
        )
      );
    }

    throw error;
  }
};
