import { Buffer } from "node:buffer";

import { sql } from "drizzle-orm";

import { createDb } from "~/db/client";

/**
 * Shared Resend sending for outbound app email. The sender identity lives in
 * `app_settings` under `email.smtp` (kept key preserves the existing row) as
 * `{ fromEmail, senderName }` and is managed from the Settings page. The
 * Resend API key is a Worker secret (`RESEND_API_KEY`), never stored in D1.
 * Used by the order-email Durable Object and the plain-email queue consumer
 * (auth emails such as new-user onboarding).
 *
 * Legacy Proton SMTP rows (`smtpUserEncrypted`, `smtpSenderName`, …) are
 * still accepted on read: the sender address falls back to the decrypted
 * legacy SMTP user so the same FROM address keeps working until the settings
 * are re-saved in the new shape.
 */

interface StoredEmailSettings {
  fromEmail?: string;
  senderName?: string;
  smtpAddress?: string;
  smtpPort?: number;
  smtpSenderName?: string;
  smtpTokenEncrypted?: string;
  smtpUserEncrypted?: string;
}

export interface ResendAttachment {
  content: Buffer;
  contentType: string;
  filename: string;
}

export interface SendEmailInput {
  attachments?: ResendAttachment[];
  html?: string;
  /** App settings key holding the sender config. Defaults to `email.smtp`. */
  settingsKey?: string;
  subject: string;
  text: string;
  to: string[];
}

export const EMAIL_SETTINGS_KEY = "email.smtp";

const RESEND_API_URL = "https://api.resend.com/emails";
const EMAIL_SETTINGS_ENCRYPTION_KEY = "EMAIL_SETTINGS_ENCRYPTION_KEY";

const getRequiredSecret = (env: Env, key: string) => {
  const value = (env as unknown as Record<string, string | undefined>)[
    key
  ]?.trim();

  if (!value) {
    throw new Error(`${key} is not configured.`);
  }

  return value;
};

/** Decrypt a legacy SMTP setting encrypted with EMAIL_SETTINGS_ENCRYPTION_KEY. */
const decryptLegacySetting = async (env: Env, encryptedValue: string) => {
  const [ivBase64, encryptedBase64] = encryptedValue.split(".");

  if (!(ivBase64 && encryptedBase64)) {
    throw new Error("Stored email setting is invalid.");
  }

  const secret = getRequiredSecret(env, EMAIL_SETTINGS_ENCRYPTION_KEY);
  const secretBytes = new TextEncoder().encode(secret);
  const hash = await crypto.subtle.digest("SHA-256", secretBytes);
  const key = await crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "decrypt",
  ]);
  const decrypted = await crypto.subtle.decrypt(
    { iv: Buffer.from(ivBase64, "base64"), name: "AES-GCM" },
    key,
    Buffer.from(encryptedBase64, "base64")
  );

  return new TextDecoder().decode(decrypted);
};

export const getStoredEmailSettings = async (env: Env, key: string) => {
  const row = await createDb(env.DB).get<{ value: string }>(
    sql`SELECT value FROM app_settings WHERE key = ${key}`
  );

  if (!row) {
    throw new Error("Email settings are not configured.");
  }

  const settings = JSON.parse(row.value) as StoredEmailSettings;
  const senderName =
    settings.senderName?.trim() ||
    settings.smtpSenderName?.trim() ||
    "Order of Service";

  const directFromEmail = settings.fromEmail?.trim().toLowerCase();

  if (directFromEmail) {
    return { fromEmail: directFromEmail, senderName };
  }

  if (settings.smtpUserEncrypted) {
    const decrypted = await decryptLegacySetting(
      env,
      settings.smtpUserEncrypted
    );
    const legacyFromEmail = decrypted.trim().toLowerCase();

    if (legacyFromEmail) {
      return { fromEmail: legacyFromEmail, senderName };
    }
  }

  throw new Error("Email settings are incomplete.");
};

/** Send an email through the Resend API using the stored sender identity. */
export const sendResendEmail = async (
  env: Env,
  input: SendEmailInput
): Promise<void> => {
  const settings = await getStoredEmailSettings(
    env,
    input.settingsKey ?? EMAIL_SETTINGS_KEY
  );
  const apiKey = getRequiredSecret(env, "RESEND_API_KEY");

  const response = await fetch(RESEND_API_URL, {
    body: JSON.stringify({
      attachments: input.attachments?.map((attachment) => ({
        content: attachment.content.toString("base64"),
        content_type: attachment.contentType,
        filename: attachment.filename,
      })),
      from: `${settings.senderName.replaceAll('"', "'")} <${settings.fromEmail}>`,
      html: input.html,
      subject: input.subject,
      text: input.text,
      to: input.to,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    const body = await response.text();
    const detail = body.slice(0, 500);
    throw new Error(
      `Resend rejected the email (HTTP ${response.status}).${detail ? ` ${detail}` : ""}`
    );
  }
};
