/**
 * Slim AI Worker: announcement background/layout queue consumer plus the Rick
 * chat agent Durable Object.
 *
 * No public HTTP surface — the portal reaches Rick through the cross-script
 * Durable Object binding, and the queue is consumed here so AI payloads never
 * share an isolate with TanStack Start.
 */
import {
  processAnnouncementImageGen,
  processAnnouncementLayoutGen,
} from "./consumer";
import { RickAgent } from "./rick-agent";
import type { AnnouncementAiQueueMessage } from "./types";
import { isBackgroundQueueMessage, isLayoutQueueMessage } from "./types";

export { RickAgent };

const IMAGE_GEN_QUEUE = "oos-announcement-image-gen";

const processMessage = async (
  message: Message<AnnouncementAiQueueMessage>
): Promise<void> => {
  const { body } = message;

  if (isLayoutQueueMessage(body)) {
    try {
      await processAnnouncementLayoutGen(body);
      message.ack();
    } catch {
      // Leave for Queues retries (max_retries / retry_delay / DLQ).
      message.retry();
    }
    return;
  }

  if (isBackgroundQueueMessage(body)) {
    try {
      await processAnnouncementImageGen(body);
      message.ack();
    } catch {
      message.retry();
    }
    return;
  }

  message.ack();
};

export default {
  // The portal reaches Rick through the cross-script Durable Object binding;
  // this Worker intentionally has no public HTTP surface.
  fetch(): Response {
    return new Response("Not found", { status: 404 });
  },
  async queue(batch: MessageBatch<AnnouncementAiQueueMessage>): Promise<void> {
    if (batch.queue !== IMAGE_GEN_QUEUE) {
      for (const message of batch.messages) {
        message.ack();
      }
      return;
    }

    // Sequential (max_batch_size is 1) — one AI job at a time per batch.
    for (const message of batch.messages) {
      // oxlint-disable-next-line eslint/no-await-in-loop -- intentional sequential jobs
      await processMessage(message);
    }
  },
} satisfies ExportedHandler<Env, AnnouncementAiQueueMessage>;
