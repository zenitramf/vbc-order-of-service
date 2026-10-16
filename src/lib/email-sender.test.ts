import { Buffer } from "node:buffer";

import { afterEach, describe, expect, it, vi } from "vitest";

import { getStoredEntraOAuthCredentials } from "~/lib/email-sender";

const dbState = vi.hoisted(() => ({
  row: null as { value: string } | null,
}));

vi.mock("~/db/client", () => ({
  createDb: () => ({
    get: () => Promise.resolve(dbState.row),
  }),
}));

const ENCRYPTION_KEY = "test-encryption-key";

const env = {
  DB: {},
  EMAIL_SETTINGS_ENCRYPTION_KEY: ENCRYPTION_KEY,
} as unknown as Env;

const encryptSetting = async (value: string): Promise<string> => {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(ENCRYPTION_KEY)
  );
  const key = await crypto.subtle.importKey("raw", hash, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { iv, name: "AES-GCM" },
    key,
    new TextEncoder().encode(value)
  );

  return `${Buffer.from(iv).toString("base64")}.${Buffer.from(encrypted).toString("base64")}`;
};

const storeSettings = (settings: Record<string, unknown>): void => {
  dbState.row = {
    value: JSON.stringify({
      smtpAddress: "smtp.office365.com",
      smtpPort: 587,
      smtpUserEncrypted: "unused-in-this-path",
      ...settings,
    }),
  };
};

afterEach(() => {
  dbState.row = null;
});

describe("getStoredEntraOAuthCredentials", () => {
  it("returns the SMTP Entra app credentials with the secret decrypted", async () => {
    storeSettings({
      oauthClientId: "entra-client-id",
      oauthClientSecretEncrypted: await encryptSetting("entra-secret-value"),
      oauthTenantId: "entra-tenant-id",
      smtpAuthType: "oauth2",
    });

    await expect(getStoredEntraOAuthCredentials(env)).resolves.toEqual({
      clientId: "entra-client-id",
      clientSecret: "entra-secret-value",
      tenantId: "entra-tenant-id",
    });
  });

  it("returns stored Entra credentials even when SMTP uses password auth", async () => {
    storeSettings({
      oauthClientId: "entra-client-id",
      oauthClientSecretEncrypted: await encryptSetting("entra-secret-value"),
      oauthTenantId: "entra-tenant-id",
      smtpAuthType: "password",
      smtpTokenEncrypted: "unused-in-this-path",
    });

    await expect(getStoredEntraOAuthCredentials(env)).resolves.toEqual({
      clientId: "entra-client-id",
      clientSecret: "entra-secret-value",
      tenantId: "entra-tenant-id",
    });
  });

  it("returns null when no Entra credentials are stored", async () => {
    storeSettings({
      smtpAuthType: "password",
      smtpTokenEncrypted: "unused-in-this-path",
    });

    await expect(getStoredEntraOAuthCredentials(env)).resolves.toBeNull();
  });

  it("returns null when no email settings are stored", async () => {
    dbState.row = null;

    await expect(getStoredEntraOAuthCredentials(env)).resolves.toBeNull();
  });

  it("throws when the stored client secret cannot be decrypted", async () => {
    storeSettings({
      oauthClientId: "entra-client-id",
      oauthClientSecretEncrypted: "not-an-encrypted-value",
      oauthTenantId: "entra-tenant-id",
      smtpAuthType: "oauth2",
    });

    await expect(getStoredEntraOAuthCredentials(env)).rejects.toThrow();
  });
});
