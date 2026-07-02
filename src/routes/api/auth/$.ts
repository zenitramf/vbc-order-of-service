import { createFileRoute } from "@tanstack/react-router";
import { env } from "cloudflare:workers";

import { createAuth } from "~/lib/auth";

/**
 * Better Auth endpoint, owned by a TanStack Start server route.
 *
 * D1 is only reachable through a Worker binding, so Better Auth cannot be a
 * global singleton. The auth instance is created per request from the
 * Cloudflare global `env` (see src/db/client.ts for the same pattern). This
 * keeps a single owner for `/api/auth/*` — the Worker fetch handler no longer
 * short-circuits this path (see src/worker.ts).
 */
const handleAuthRequest = (request: Request): Promise<Response> =>
  createAuth(env).handler(request);

export const Route = createFileRoute("/api/auth/$")({
  server: {
    handlers: {
      GET: ({ request }: { request: Request }) => handleAuthRequest(request),
      POST: ({ request }: { request: Request }) => handleAuthRequest(request),
    },
  },
});
