import { DurableObject } from "cloudflare:workers";
import nodemailer from "nodemailer";
import { Buffer } from "node:buffer";

import type { OrderEmailQueueMessage } from "~/lib/order-service-types";

interface StoredEmailSettings {
  smtpAddress?: string;
  smtpPort?: number;
  smtpSenderName?: string;
  smtpTokenEncrypted?: string;
  smtpUserEncrypted?: string;
}

const EMAIL_SETTINGS_ENCRYPTION_KEY = "EMAIL_SETTINGS_ENCRYPTION_KEY";
const SECURE_SMTP_PORT = 465;

const getErrorMessage = (error: unknown, fallbackMessage: string) =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const getRequiredSecret = (env: Env, key: string) => {
  const value = (env as unknown as Record<string, string | undefined>)[key]?.trim();

  if (!value) {
    throw new Error(`${key} is not configured.`);
  }

  return value;
};

const getEmailEncryptionKey = async (env: Env) => {
  const secret = getRequiredSecret(env, EMAIL_SETTINGS_ENCRYPTION_KEY);
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", secretBytes);

  return crypto.subtle.importKey("raw", hash, "AES-GCM", false, ["decrypt"]);
};

const decryptSetting = async (env: Env, encryptedValue: string) => {
  const [ivBase64, encryptedBase64] = encryptedValue.split(".");

  if (!ivBase64 || !encryptedBase64) {
    throw new Error("Stored SMTP setting is invalid.");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const decrypted = await crypto.subtle.decrypt(
    { iv, name: "AES-GCM" },
    await getEmailEncryptionKey(env),
    encrypted
  );

  return new TextDecoder().decode(decrypted);
};

const getStoredEmailSettings = async (env: Env, key: string) => {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(key)
    .first<{ value: string }>();

  if (!row) {
    throw new Error("SMTP settings are not configured.");
  }

  const settings = JSON.parse(row.value) as StoredEmailSettings;

  if (!(settings.smtpAddress && settings.smtpPort && settings.smtpTokenEncrypted && settings.smtpUserEncrypted)) {
    throw new Error("SMTP settings are incomplete.");
  }

  return {
    smtpAddress: settings.smtpAddress,
    smtpPort: settings.smtpPort,
    smtpSenderName: settings.smtpSenderName?.trim() || "Order of Service",
    smtpTokenEncrypted: settings.smtpTokenEncrypted,
    smtpUserEncrypted: settings.smtpUserEncrypted,
  };
};

const updateDeliveryStatus = async (
  env: Env,
  deliveryId: string,
  status: "Sending" | "Sent" | "Failed",
  errorMessage?: string
) => {
  const timestamp = new Date().toISOString();

  await env.DB.prepare(
    `UPDATE order_email_deliveries
    SET status = ?, sent_at = CASE WHEN ? = 'Sent' THEN ? ELSE sent_at END,
      error_message = ?, updated_at = ?
    WHERE id = ?`
  )
    .bind(status, status, timestamp, errorMessage ?? null, timestamp, deliveryId)
    .run();
};

export class OrderEmailStatusDurableObject extends DurableObject<Env> {
  async processEmail(message: OrderEmailQueueMessage): Promise<void> {
    const existingDelivery = await this.env.DB.prepare(
      "SELECT status FROM order_email_deliveries WHERE id = ?"
    )
      .bind(message.deliveryId)
      .first<{ status: string }>();

    if (existingDelivery?.status === "Sent") {
      return;
    }

    try {
      await updateDeliveryStatus(this.env, message.deliveryId, "Sending");

      const settings = await getStoredEmailSettings(this.env, message.smtpSettingsKey);
      const [smtpUser, smtpToken, object] = await Promise.all([
        decryptSetting(this.env, settings.smtpUserEncrypted),
        decryptSetting(this.env, settings.smtpTokenEncrypted),
        this.env.SERVICE_PDFS.get(message.attachment.objectKey),
      ]);

      if (!object) {
        throw new Error("Published PDF was not found in R2 storage.");
      }

      const pdfBuffer = Buffer.from(await object.arrayBuffer());
      const transporter = nodemailer.createTransport({
        auth: {
          pass: smtpToken,
          user: smtpUser,
        },
        host: settings.smtpAddress,
        port: settings.smtpPort,
        secure: settings.smtpPort === SECURE_SMTP_PORT,
      });

      await transporter.sendMail({
        attachments: [
          {
            content: pdfBuffer,
            contentType: message.attachment.contentType,
            filename: message.attachment.filename,
          },
        ],
        from: `${settings.smtpSenderName.replaceAll('"', "'")} <${smtpUser}>`,
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
