import { eq } from "drizzle-orm";

import { getAppDb } from "~/db/client";
import { apiKeys } from "~/db/schema";
import { hashApiKey } from "~/lib/api-key-crypto";

const API_KEY_CACHE_TTL_MS = 3000;

interface CachedApiKey {
  expiresAt: number;
  value: { id: string; userId: string };
}

const resolvedApiKeys = new Map<string, CachedApiKey>();

export const resolveApiKey = async (
  key: string
): Promise<{ id: string; userId: string } | null> => {
  const normalized = key.trim();

  if (!normalized) {
    return null;
  }

  const hash = await hashApiKey(normalized);
  const now = Date.now();
  const cached = resolvedApiKeys.get(hash);

  if (cached) {
    if (cached.expiresAt > now) {
      return cached.value;
    }

    resolvedApiKeys.delete(hash);
  }

  const db = getAppDb();
  const row = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .get();

  if (!row) {
    return null;
  }

  const value = { id: row.id, userId: row.userId };

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  resolvedApiKeys.set(hash, {
    expiresAt: now + API_KEY_CACHE_TTL_MS,
    value,
  });

  return value;
};
