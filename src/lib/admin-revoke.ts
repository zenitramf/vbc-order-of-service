import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getAppDb } from "~/db/client";
import { session } from "~/db/schema";
import { createAuth } from "~/lib/auth";

const revokeUserSessionInput = z.object({
  sessionId: z.string().min(1),
  userId: z.string().min(1),
});

const revokeUserSessionsInput = z.object({
  userId: z.string().min(1),
});

const requireAdmin = async () => {
  const headers = getRequestHeaders();
  const currentSession = await createAuth(env).api.getSession({ headers });

  if (!currentSession || currentSession.user.role !== "admin") {
    throw new Error("You do not have permission to manage users.");
  }
};

export const revokeUserSessionAdmin = createServerFn({ method: "POST" })
  .validator((data) => revokeUserSessionInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();

    await getAppDb()
      .delete(session)
      .where(
        and(eq(session.id, data.sessionId), eq(session.userId, data.userId))
      );

    return { success: true };
  });

export const revokeUserSessionsAdmin = createServerFn({ method: "POST" })
  .validator((data) => revokeUserSessionsInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();

    await getAppDb().delete(session).where(eq(session.userId, data.userId));

    return { success: true };
  });
