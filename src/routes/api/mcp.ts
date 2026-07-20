import { createFileRoute } from "@tanstack/react-router";

import { handleMcpRequest } from "~/lib/mcp-server";

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      DELETE: ({ request }: { request: Request }) => handleMcpRequest(request),
      GET: ({ request }: { request: Request }) => handleMcpRequest(request),
      POST: ({ request }: { request: Request }) => handleMcpRequest(request),
    },
  },
});
