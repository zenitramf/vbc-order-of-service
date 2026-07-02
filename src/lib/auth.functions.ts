import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";

import { createAuth } from "~/lib/auth";

const readSession = async () => {
  const headers = getRequestHeaders();
  return await createAuth(env).api.getSession({ headers });
};

export const getSession = createServerFn({ method: "GET" }).handler(
  readSession
);

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await readSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    return session;
  }
);

export const requireSessionMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const session = await readSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return next({ context: { session } });
});
