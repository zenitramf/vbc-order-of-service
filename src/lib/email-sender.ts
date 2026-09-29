import { Buffer } from "node:buffer";

import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";

import { createDb } from "~/db/client";

/**
 * Shared SMTP sending for outbound app email. The SMTP credentials live
 * encrypted in `app_settings` under `email.smtp` and are managed from the
 * Settings page. Used by the order-email Durable Object and the plain-email
 * queue consumer (auth emails such as new-user onboarding).
 */

interface StoredEmailSettings {
  smtpAddress?: string;
  smtpPort?: number;
  smtpSenderName?: string;
  smtpTokenEncrypted?: string;
  smtpUserEncrypted?: string;
}

export interface SmtpAttachment {
  content: Buffer;
  contentType: string;
  filename: string;
}

export interface SendSmtpEmailInput {
  attachments?: SmtpAttachment[];
  html?: string;
  /** App settings key holding the SMTP config. Defaults to `email.smtp`. */
  settingsKey?: string;
  subject: string;
  text: string;
  to: string[];
}

export const EMAIL_SETTINGS_KEY = "email.smtp";

const EMAIL_SETTINGS_ENCRYPTION_KEY = "EMAIL_SETTINGS_ENCRYPTION_KEY";
const SECURE_SMTP_PORT = 465;

const getRequiredSecret = (env: Env, key: string) => {
  const value = (env as unknown as Record<string, string | undefined>)[
    key
  ]?.trim();

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

  if (!(ivBase64 && encryptedBase64)) {
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

export const getStoredEmailSettings = async (env: Env, key: string) => {
  const row = await createDb(env.DB).get<{ value: string }>(
    sql`SELECT value FROM app_settings WHERE key = ${key}`
  );

  if (!row) {
    throw new Error("SMTP settings are not configured.");
  }

  const settings = JSON.parse(row.value) as StoredEmailSettings;

  if (
    !(
      settings.smtpAddress &&
      settings.smtpPort &&
      settings.smtpTokenEncrypted &&
      settings.smtpUserEncrypted
    )
  ) {
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

/** Send an email through the SMTP settings stored in `app_settings`. */
export const sendSmtpEmail = async (
  env: Env,
  input: SendSmtpEmailInput
): Promise<void> => {
  const settings = await getStoredEmailSettings(
    env,
    input.settingsKey ?? EMAIL_SETTINGS_KEY
  );
  const [smtpUser, smtpToken] = await Promise.all([
    decryptSetting(env, settings.smtpUserEncrypted),
    decryptSetting(env, settings.smtpTokenEncrypted),
  ]);
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
    attachments: input.attachments,
    from: `${settings.smtpSenderName.replaceAll('"', "'")} <${smtpUser}>`,
    html: input.html,
    subject: input.subject,
    text: input.text,
    to: input.to,
  });
};
