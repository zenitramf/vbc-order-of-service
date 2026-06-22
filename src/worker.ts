import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

export default {
  async fetch(request: Request): Promise<Response> {
    return serverEntry.fetch(request);
  },
  async queue(batch: MessageBatch<OrderEmailQueueMessage>, env: Env): Promise<void> {
    for (const message of batch.messages) {
      const stub = env.ORDER_EMAIL_STATUS.getByName(message.body.orderId);
      await stub.processEmail(message.body);
    }
  },
} satisfies ExportedHandler<Env, OrderEmailQueueMessage>;
