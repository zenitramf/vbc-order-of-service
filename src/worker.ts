import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import { createAuth } from "~/lib/auth";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Better Auth owns everything under /api/auth/* (incl. the /ok health check).
    // Handled here at the Worker edge so it does not depend on the framework's
    // server-route API. Everything else falls through to TanStack Start.
    if (new URL(request.url).pathname.startsWith("/api/auth")) {
      return await createAuth(env).handler(request);
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
