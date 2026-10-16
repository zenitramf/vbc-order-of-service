import { Buffer } from "node:buffer";

import { sql } from "drizzle-orm";
import nodemailer from "nodemailer";

import { createDb } from "~/db/client";
import { getExchangeSmtpAccessToken } from "~/lib/exchange-oauth";
import type { ExchangeOAuthCredentials } from "~/lib/exchange-oauth";
import type { SmtpAuthType } from "~/lib/order-service-types";

/**
 * Shared SMTP sending for outbound app email. The SMTP credentials live
 * encrypted in `app_settings` under `email.smtp` and are managed from the
 * Settings page. Used by the order-email Durable Object and the plain-email
 * queue consumer (auth emails such as new-user onboarding).
 *
 * Two credential flavors are supported: a mailbox password/app password, or
 * Entra OAuth2 (client-credentials grant, SASL XOAUTH2) for Exchange Online.
 * The mailbox address (`smtpUser`) is always required: it is the login for
 * password auth and the XOAUTH2 username for OAuth2.
 */

interface StoredEmailSettings {
  oauthClientId?: string;
  oauthClientSecretEncrypted?: string;
  oauthTenantId?: string;
  smtpAddress?: string;
  smtpAuthType?: string;
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

interface ResolvedEmailSettingsBase {
  smtpAddress: string;
  smtpPort: number;
  smtpSenderName: string;
  smtpTokenEncrypted?: string;
  smtpUserEncrypted: string;
}

export interface ResolvedPasswordEmailSettings extends ResolvedEmailSettingsBase {
  oauthClientId?: string;
  oauthClientSecretEncrypted?: string;
  oauthTenantId?: string;
  smtpAuthType: "password";
  smtpTokenEncrypted: string;
}

export interface ResolvedOAuthEmailSettings extends ResolvedEmailSettingsBase {
  oauthClientId: string;
  oauthClientSecretEncrypted: string;
  oauthTenantId: string;
  smtpAuthType: "oauth2";
}

export type ResolvedEmailSettings =
  | ResolvedOAuthEmailSettings
  | ResolvedPasswordEmailSettings;

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

export const getStoredEmailSettings = async (
  env: Env,
  key: string
): Promise<ResolvedEmailSettings> => {
  const row = await createDb(env.DB).get<{ value: string }>(
    sql`SELECT value FROM app_settings WHERE key = ${key}`
  );

  if (!row) {
    throw new Error("SMTP settings are not configured.");
  }

  const settings = JSON.parse(row.value) as StoredEmailSettings;
  const smtpAuthType: SmtpAuthType =
    settings.smtpAuthType === "oauth2" ? "oauth2" : "password";

  if (
    !(settings.smtpAddress && settings.smtpPort && settings.smtpUserEncrypted)
  ) {
    throw new Error("SMTP settings are incomplete.");
  }

  const base = {
    smtpAddress: settings.smtpAddress,
    smtpPort: settings.smtpPort,
    smtpSenderName: settings.smtpSenderName?.trim() || "Order of Service",
    smtpUserEncrypted: settings.smtpUserEncrypted,
  };

  if (smtpAuthType === "oauth2") {
    if (
      !(
        settings.oauthTenantId &&
        settings.oauthClientId &&
        settings.oauthClientSecretEncrypted
      )
    ) {
      throw new Error("SMTP OAuth settings are incomplete.");
    }

    return {
      ...base,
      oauthClientId: settings.oauthClientId,
      oauthClientSecretEncrypted: settings.oauthClientSecretEncrypted,
      oauthTenantId: settings.oauthTenantId,
      smtpAuthType,
      smtpTokenEncrypted: settings.smtpTokenEncrypted,
    };
  }

  if (settings.smtpTokenEncrypted === undefined) {
    throw new Error("SMTP settings are incomplete.");
  }

  return {
    ...base,
    oauthClientId: settings.oauthClientId,
    oauthClientSecretEncrypted: settings.oauthClientSecretEncrypted,
    oauthTenantId: settings.oauthTenantId,
    smtpAuthType,
    smtpTokenEncrypted: settings.smtpTokenEncrypted,
  };
};

/**
 * The Entra app credentials stored with the SMTP OAuth settings, for
 * Microsoft Graph calls made with the same app registration (for example
 * SharePoint uploads). Returns null when no complete Entra credential set is
 * stored; a stored secret that cannot be decrypted throws so callers can
 * report an auth failure instead of a missing configuration.
 */
export const getStoredEntraOAuthCredentials = async (
  env: Env
): Promise<ExchangeOAuthCredentials | null> => {
  const settings = await getStoredEmailSettings(env, EMAIL_SETTINGS_KEY).catch(
    () => null
  );

  if (
    !(
      settings?.oauthTenantId &&
      settings.oauthClientId &&
      settings.oauthClientSecretEncrypted
    )
  ) {
    return null;
  }

  const clientSecret = await decryptSetting(
    env,
    settings.oauthClientSecretEncrypted
  );

  return {
    clientId: settings.oauthClientId,
    clientSecret,
    tenantId: settings.oauthTenantId,
  };
};

const getGraphEnvValue = (
  env: Env,
  key: "GRAPH_CLIENT_ID" | "GRAPH_CLIENT_SECRET" | "GRAPH_TENANT_ID"
): string | undefined => {
  const value = (env as unknown as Record<string, unknown>)[key];

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
};

/**
 * Credentials for Microsoft Graph calls (SharePoint uploads and downloads):
 * the Entra app stored with the email settings when present, otherwise the
 * `GRAPH_*` Worker secrets. Returns null when neither source is complete.
 */
export const getMicrosoftGraphCredentials = async (
  env: Env
): Promise<ExchangeOAuthCredentials | null> => {
  const stored = await getStoredEntraOAuthCredentials(env);

  if (stored) {
    return stored;
  }

  const tenantId = getGraphEnvValue(env, "GRAPH_TENANT_ID");
  const clientId = getGraphEnvValue(env, "GRAPH_CLIENT_ID");
  const clientSecret = getGraphEnvValue(env, "GRAPH_CLIENT_SECRET");

  return tenantId && clientId && clientSecret
    ? { clientId, clientSecret, tenantId }
    : null;
};

const resolveTransportAuth = async (
  env: Env,
  settings: ResolvedEmailSettings,
  smtpUser: string
) => {
  if (settings.smtpAuthType === "password") {
    const smtpToken = await decryptSetting(env, settings.smtpTokenEncrypted);

    return { pass: smtpToken, user: smtpUser };
  }

  const clientSecret = await decryptSetting(
    env,
    settings.oauthClientSecretEncrypted
  );
  const accessToken = await getExchangeSmtpAccessToken({
    clientId: settings.oauthClientId,
    clientSecret,
    tenantId: settings.oauthTenantId,
  });

  return { accessToken, type: "OAuth2", user: smtpUser } as const;
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
  const smtpUser = await decryptSetting(env, settings.smtpUserEncrypted);
  const transporter = nodemailer.createTransport({
    auth: await resolveTransportAuth(env, settings, smtpUser),
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
