import serverEntry from "@tanstack/react-start/server-entry";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import { processAnnouncementImageGen } from "~/lib/announcement-data";
import type { AnnouncementImageGenQueueMessage } from "~/lib/announcement-types";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

const EMAIL_QUEUE = "oos-email-sender";
const IMAGE_GEN_QUEUE = "oos-announcement-image-gen";

type QueueMessage = OrderEmailQueueMessage | AnnouncementImageGenQueueMessage;

const isEmailMessage = (body: QueueMessage): body is OrderEmailQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  "orderId" in body &&
  "deliveryId" in body;

const isImageGenMessage = (
  body: QueueMessage
): body is AnnouncementImageGenQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  "announcementId" in body &&
  "jobId" in body;

const processEmailBatch = async (
  batch: MessageBatch<QueueMessage>,
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

const processImageGenMessage = async (
  message: Message<QueueMessage>
): Promise<void> => {
  if (!isImageGenMessage(message.body)) {
    message.ack();
    return;
  }

  try {
    await processAnnouncementImageGen(message.body);
    message.ack();
  } catch {
    // Leave for Queues retries (max_retries / retry_delay / DLQ).
    message.retry();
  }
};

export default {
  // `/api/auth/*` is owned by the TanStack Start server route in
  // src/routes/api/auth/$.ts, which instantiates Better Auth from the
  // Cloudflare global `env`. The Worker fetch handler forwards every
  // request to TanStack Start so that route is reachable.
  async fetch(request: Request): Promise<Response> {
    return await serverEntry.fetch(request);
  },
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    if (batch.queue === EMAIL_QUEUE) {
      await processEmailBatch(batch, env);
      return;
    }

    if (batch.queue === IMAGE_GEN_QUEUE) {
      // Sequential (max_batch_size is 1) — avoid parallel AI memory spikes.
      for (const message of batch.messages) {
        // oxlint-disable-next-line eslint/no-await-in-loop -- intentional sequential jobs
        await processImageGenMessage(message);
      }
      return;
    }

    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, QueueMessage>;
