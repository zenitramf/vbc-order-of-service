import { Buffer } from "node:buffer";

import { DurableObject } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";

import { createDb } from "~/db/client";
import { orderEmailDeliveries } from "~/db/schema";
import {
  getMicrosoftGraphCredentials,
  sendSmtpEmail,
} from "~/lib/email-sender";
import type { OrderEmailQueueMessage } from "~/lib/order-service-types";
import {
  downloadOrderPdfFromSharePoint,
  getSharePointPdfFilename,
} from "~/lib/sharepoint-upload";

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

      const { attachment } = message;
      let pdfBytes: ArrayBuffer | null = null;

      // SharePoint is the primary PDF store. The R2 object key covers
      // orders not backfilled yet and messages queued before SharePoint
      // storage existed.
      if (attachment.sharepointItemId || attachment.serviceDate) {
        const credentials = await getMicrosoftGraphCredentials(this.env).catch(
          (error: unknown) => {
            console.error(
              "Unable to read the Graph credentials for the email attachment.",
              error
            );
            return null;
          }
        );
        pdfBytes = await downloadOrderPdfFromSharePoint({
          credentials,
          filename: getSharePointPdfFilename(attachment.filename),
          itemId: attachment.sharepointItemId,
          serviceDate: attachment.serviceDate ?? "",
        });
      }

      if (!pdfBytes && attachment.objectKey) {
        const object = await this.env.SERVICE_PDFS.get(attachment.objectKey);
        pdfBytes = object ? await object.arrayBuffer() : null;
      }

      if (!pdfBytes) {
        throw new Error("Published PDF was not found in storage.");
      }

      await sendSmtpEmail(this.env, {
        attachments: [
          {
            content: Buffer.from(pdfBytes),
            contentType: attachment.contentType,
            filename: attachment.filename,
          },
        ],
        settingsKey: message.smtpSettingsKey ?? message.settingsKey,
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
