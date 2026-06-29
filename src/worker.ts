import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

export default {
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
