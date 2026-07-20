import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { getAppDb } from "~/db/client";
import { apiKeys } from "~/db/schema";
import { hashApiKey } from "~/lib/api-key-crypto";
import { createAuth } from "~/lib/auth";

export interface ApiKeySummary {
  createdAt: string;
  id: string;
  keyPrefix: string;
  lastUsedAt?: string;
  name: string;
  userId: string;
}

export interface CreatedApiKey extends ApiKeySummary {
  key: string;
}

interface ApiKeyRow {
  createdAt: Date;
  id: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  name: string;
  userId: string;
}

const toSummary = (row: ApiKeyRow): ApiKeySummary => ({
  createdAt: row.createdAt.toISOString(),
  id: row.id,
  keyPrefix: row.keyPrefix,
  ...(row.lastUsedAt ? { lastUsedAt: row.lastUsedAt.toISOString() } : {}),
  name: row.name,
  userId: row.userId,
});

const requireSession = async () => {
  const session = await createAuth(env).api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
};

const requireAdmin = async () => {
  const session = await requireSession();

  if (session.user.role !== "admin") {
    throw new Error("You do not have permission to manage API keys.");
  }

  return session;
};

const generateKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `vbc_${btoa(String.fromCodePoint(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "")}`;
};

const selectColumns = {
  createdAt: apiKeys.createdAt,
  id: apiKeys.id,
  keyPrefix: apiKeys.keyPrefix,
  lastUsedAt: apiKeys.lastUsedAt,
  name: apiKeys.name,
  userId: apiKeys.userId,
};

export const listMyApiKeys = createServerFn({ method: "GET" }).handler(
  async (): Promise<ApiKeySummary[]> => {
    const session = await requireSession();
    const rows = await getAppDb()
      .select(selectColumns)
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .orderBy(desc(apiKeys.createdAt))
      .all();

    return rows.map((row) => toSummary(row as ApiKeyRow));
  }
);

export const createMyApiKey = createServerFn({ method: "POST" })
  .validator((data: { name: string }) => data)
  .handler(async ({ data }): Promise<CreatedApiKey> => {
    const session = await requireSession();
    const name = data.name.trim();

    if (!name) {
      throw new Error("API key name is required.");
    }

    const db = getAppDb();
    const existing = await db
      .select({ id: apiKeys.id })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .all();

    if (existing.length >= 20) {
      throw new Error(
        "You can have at most 20 API keys. Revoke one to create another."
      );
    }

    const key = generateKey();
    const now = new Date();
    const row: ApiKeyRow = {
      createdAt: now,
      id: uuidv4(),
      keyPrefix: key.slice(0, 12),
      lastUsedAt: null,
      name,
      userId: session.user.id,
    };

    await db.insert(apiKeys).values({
      ...row,
      keyHash: await hashApiKey(key),
    });

    return { ...toSummary(row), key };
  });

export const deleteMyApiKey = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const session = await requireSession();

    await getAppDb()
      .delete(apiKeys)
      .where(and(eq(apiKeys.id, data), eq(apiKeys.userId, session.user.id)));

    return { success: true };
  });

export const listUserApiKeysAdmin = createServerFn({ method: "GET" })
  .validator((userId: string) => userId)
  .handler(async ({ data }): Promise<ApiKeySummary[]> => {
    await requireAdmin();
    const rows = await getAppDb()
      .select(selectColumns)
      .from(apiKeys)
      .where(eq(apiKeys.userId, data))
      .orderBy(desc(apiKeys.createdAt))
      .all();

    return rows.map((row) => toSummary(row as ApiKeyRow));
  });

export const deleteUserApiKeyAdmin = createServerFn({ method: "POST" })
  .validator((data: { userId: string; apiKeyId: string }) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();

    await getAppDb()
      .delete(apiKeys)
      .where(
        and(eq(apiKeys.id, data.apiKeyId), eq(apiKeys.userId, data.userId))
      );

    return { success: true };
  });
