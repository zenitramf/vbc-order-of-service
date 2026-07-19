import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";
import { handleMcpRequest, isMcpRequest } from "~/mcp";

export { OrderEmailStatusDurableObject };

export default {
  // `/mcp` is the Streamable HTTP MCP endpoint (Agents SDK createMcpHandler).
  // `/api/auth/*` is owned by the TanStack Start server route in
  // src/routes/api/auth/$.ts. Everything else forwards to TanStack Start.
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    if (isMcpRequest(request)) {
      return await handleMcpRequest(request, env, ctx);
    }

    return await serverEntry.fetch(request);
  },
  async queue(
    batch: MessageBatch<OrderEmailQueueMessage>,
    env: Env
  ): Promise<void> {
    await Promise.all(
      batch.messages.map((message) => {
        const stub = env.ORDER_EMAIL_STATUS.getByName(message.body.orderId);
        return stub.processEmail(message.body);
      })
    );
  },
} satisfies ExportedHandler<Env, OrderEmailQueueMessage>;
