/**
 * MCP client for the portal's `/api/mcp` endpoint, used by the Rick agent.
 *
 * The Durable Object calls the main app through the `PORTAL` service binding
 * with a short-lived agent token, so every tool runs with the signed-in
 * user's permissions and existing MCP permission checks.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type {
  CallToolResult,
  ContentBlock,
} from "@modelcontextprotocol/sdk/types.js";
import type { JSONSchema7, ToolSet } from "ai";
import { jsonSchema, tool } from "ai";

import { requiresRickApproval } from "../../../src/lib/rick-approval";

const MCP_ENDPOINT = "https://portal/api/mcp";

export interface RickMcpSession {
  client: Client;
  tools: ToolSet;
}

export interface CreateRickMcpSessionOptions {
  fetchPortal: (request: Request) => Promise<Response>;
  token: string;
}

type TextBlock = Extract<ContentBlock, { type: "text" }>;

const isTextBlock = (value: ContentBlock): value is TextBlock =>
  value.type === "text";

/**
 * The portal wraps every tool result as JSON text. Unwrap it so the model sees
 * an object rather than a stringified blob, and turn `isError` into a real
 * thrown error so the AI SDK reports a failed tool call.
 */
const unwrapToolResult = (result: CallToolResult): unknown => {
  const blocks = Array.isArray(result.content) ? result.content : [];
  const text = blocks
    .filter(isTextBlock)
    .map((block) => block.text)
    .join("\n");

  if (result.isError) {
    throw new TypeError(text || "The portal tool failed.");
  }

  if (!text) {
    return blocks;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

/** Connect to the portal's MCP server and expose its tools to the AI SDK. */
export const createRickMcpSession = async ({
  fetchPortal,
  token,
}: CreateRickMcpSessionOptions): Promise<RickMcpSession> => {
  const client = new Client({ name: "rick-agent", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_ENDPOINT), {
    fetch: (input, init) => fetchPortal(new Request(input, init)),
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });

  try {
    await client.connect(transport);

    const { tools: definitions } = await client.listTools();
    const tools: ToolSet = {};

    for (const { description, inputSchema, name } of definitions) {
      tools[name] = tool({
        description: description ?? `Portal tool: ${name}`,
        execute: async (input) => {
          const result = await client.callTool({
            arguments: input,
            name,
          });

          if (!("content" in result)) {
            throw new TypeError("The portal tool returned no content.");
          }

          return unwrapToolResult(result as CallToolResult);
        },
        inputSchema: jsonSchema<Record<string, unknown>>(
          inputSchema as JSONSchema7
        ),
        needsApproval: (input) => requiresRickApproval(name, input),
      });
    }

    return { client, tools };
  } catch (error) {
    await client.close().catch(() => null);
    throw error;
  }
};
