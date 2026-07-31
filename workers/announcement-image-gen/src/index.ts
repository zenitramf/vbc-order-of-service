/**
 * Slim queue consumer Worker for announcement AI (backgrounds + layout).
 * No HTTP app surface — only processes oos-announcement-image-gen messages.
 */
import {
  processAnnouncementImageGen,
  processAnnouncementLayoutGen,
} from "./consumer";
import type { AnnouncementAiQueueMessage } from "./types";
import {
  isBackgroundQueueMessage,
  isLayoutQueueMessage,
} from "./types";

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
  async queue(
    batch: MessageBatch<AnnouncementAiQueueMessage>
  ): Promise<void> {
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
