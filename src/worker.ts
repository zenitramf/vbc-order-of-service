import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

const EMAIL_QUEUE = "oos-email-sender";

const isEmailMessage = (body: unknown): body is OrderEmailQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  "orderId" in body &&
  "deliveryId" in body;

const processEmailBatch = async (
  batch: MessageBatch<OrderEmailQueueMessage>,
  env: Env
): Promise<void> => {
  await Promise.all(
    batch.messages.map(async (message) => {
      if (!isEmailMessage(message.body)) {
        message.ack();
        return;
      }

      const stub = env.ORDER_EMAIL_STATUS.getByName(message.body.orderId);
      await stub.processEmail(message.body);
    })
  );
};

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
    if (batch.queue === EMAIL_QUEUE) {
      await processEmailBatch(batch, env);
      return;
    }

    // Image-gen is consumed by vbc-oos-announcement-image-gen (separate Worker).
    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, OrderEmailQueueMessage>;
