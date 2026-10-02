import { Buffer } from "node:buffer";

import { DurableObject } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";

import { createDb } from "~/db/client";
import { orderEmailDeliveries } from "~/db/schema";
import { sendResendEmail } from "~/lib/email-sender";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

const getErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const updateDeliveryStatus = async (
  env: Env,
  deliveryId: string,
  status: "Sending" | "Sent" | "Failed",
  errorMessage?: string
) => {
  const timestamp = new Date().toISOString();

  await createDb(env.DB).run(
    sql`UPDATE order_email_deliveries
    SET status = ${status},
      sent_at = CASE WHEN ${status} = 'Sent' THEN ${timestamp} ELSE sent_at END,
      error_message = ${errorMessage ?? null},
      updated_at = ${timestamp}
    WHERE id = ${deliveryId}`
  );
};

export class OrderEmailStatusDurableObject extends DurableObject<Env> {
  async processEmail(message: OrderEmailQueueMessage): Promise<void> {
    const existingDelivery = await createDb(this.env.DB)
      .select({ status: orderEmailDeliveries.status })
      .from(orderEmailDeliveries)
      .where(eq(orderEmailDeliveries.id, message.deliveryId))
      .get();

    if (existingDelivery?.status === "Sent") {
      return;
    }

    try {
      await updateDeliveryStatus(this.env, message.deliveryId, "Sending");

      const object = await this.env.SERVICE_PDFS.get(
        message.attachment.objectKey
      );

      if (!object) {
        throw new Error("Published PDF was not found in R2 storage.");
      }

      await sendResendEmail(this.env, {
        attachments: [
          {
            content: Buffer.from(await object.arrayBuffer()),
            contentType: message.attachment.contentType,
            filename: message.attachment.filename,
          },
        ],
        settingsKey: message.settingsKey ?? message.smtpSettingsKey,
        subject: message.subject,
        text: message.body,
        to: message.recipients,
      });

      await updateDeliveryStatus(this.env, message.deliveryId, "Sent");
    } catch (error) {
      await updateDeliveryStatus(
        this.env,
        message.deliveryId,
        "Failed",
        getErrorMessage(error, "Unable to send email.")
      );
    }
  }
}
