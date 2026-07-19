import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { McpAuthError } from "~/mcp/auth";

/** Serialize a value as a single MCP text content block (JSON). */
export const jsonToolResult = (value: unknown): CallToolResult => ({
  content: [
    {
      text: JSON.stringify(value, null, 2),
      type: "text",
    },
  ],
});

/** Turn thrown errors into MCP tool error results (or rethrow auth). */
export const toolErrorResult = (error: unknown): CallToolResult => {
  if (error instanceof McpAuthError) {
    return {
      content: [{ text: error.message, type: "text" }],
      isError: true,
    };
  }

  const message =
    error instanceof Error ? error.message : "Unexpected MCP tool error.";

  return {
    content: [{ text: message, type: "text" }],
    isError: true,
  };
};

export const withToolErrors = async (
  run: () => Promise<CallToolResult>
): Promise<CallToolResult> => {
  try {
    return await run();
  } catch (error) {
    return toolErrorResult(error);
  }
};
