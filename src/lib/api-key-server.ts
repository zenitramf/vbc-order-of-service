import { eq } from "drizzle-orm";

import { getAppDb } from "~/db/client";
import { apiKeys } from "~/db/schema";
import { hashApiKey } from "~/lib/api-key-crypto";

export const resolveApiKey = async (
  key: string
): Promise<{ id: string; userId: string } | null> => {
  const normalized = key.trim();

  if (!normalized) {
    return null;
  }

  const hash = await hashApiKey(normalized);
  const db = getAppDb();
  const row = await db
    .select({ id: apiKeys.id, userId: apiKeys.userId })
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash))
    .get();

  if (!row) {
    return null;
  }

  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id));

  return row;
};
