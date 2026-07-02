import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

export default {
  // `/api/auth/*` is owned by the TanStack Start server route in
  // src/routes/api/auth/$.ts, which instantiates Better Auth from the
  // Cloudflare global `env`. The Worker fetch handler forwards every
  // request to TanStack Start so that route is reachable.
  async fetch(request: Request): Promise<Response> {
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
