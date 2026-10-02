import serverEntry from "@tanstack/react-start/server-entry";
import { routeAgentRequest } from "agents";

import { OrderEmailStatusDurableObject } from "~/email-status-durable-object";
import { createAuth } from "~/lib/auth";
import { sendResendEmail } from "~/lib/email-sender";
import type {
  EmailQueueMessage,
  OrderEmailQueueMessage,
  PlainEmailQueueMessage,
} from "~/lib/order-service-types";

export { OrderEmailStatusDurableObject };

const EMAIL_QUEUE = "oos-email-sender";
const RICK_AGENT_PREFIX = "/agents/rick-agent/";

interface AgentRoute {
  className: string;
  name: string;
}

/**
 * Authorize a Rick agent request. The caller must be a signed-in Better Auth
 * user, and the Durable Object instance name must be that same user's id, so a
 * user can never open someone else's conversation. The sidecar has no public
 * HTTP surface (`workers_dev: false`).
 */
const authorizeRickAgentRequest = async (
  request: Request,
  route: AgentRoute,
  env: Env
): Promise<Response | undefined> => {
  const session = await createAuth(env).api.getSession({
    headers: request.headers,
  });
  const userId = session?.user?.id;

  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (route.name !== userId) {
    return new Response("Forbidden", { status: 403 });
  }

  return undefined;
};

const isOrderEmailMessage = (body: unknown): body is OrderEmailQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  "orderId" in body &&
  "deliveryId" in body;

const isPlainEmailMessage = (body: unknown): body is PlainEmailQueueMessage =>
  typeof body === "object" &&
  body !== null &&
  "type" in body &&
  body.type === "plain" &&
  "to" in body &&
  "subject" in body &&
  "text" in body;

const processEmailBatch = async (
  batch: MessageBatch<EmailQueueMessage>,
  env: Env
): Promise<void> => {
  await Promise.all(
    batch.messages.map(async (message) => {
      const { body } = message;

      if (isOrderEmailMessage(body)) {
        const stub = env.ORDER_EMAIL_STATUS.getByName(body.orderId);
        await stub.processEmail(body);
        return;
      }

      if (isPlainEmailMessage(body)) {
        try {
          await sendResendEmail(env, body);
        } catch (error) {
          // Plain emails have no delivery row to record failures against, so
          // surface them in Workers Logs instead.
          console.error("Unable to send queued email.", error);
        }
      }

      message.ack();
    })
  );
};

export default {
  // `/api/auth/*` is owned by the TanStack Start server route in
  // src/routes/api/auth/$.ts, which instantiates Better Auth from the
  // Cloudflare global `env`. The Worker fetch handler forwards every
  // request to TanStack Start so that route is reachable.
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Rick's WebSocket and HTTP agent traffic is authorized here, then routed
    // through the cross-script Durable Object binding on the AI sidecar.
    if (url.pathname.startsWith(RICK_AGENT_PREFIX)) {
      const response = await routeAgentRequest(request, env, {
        onBeforeConnect: (hookRequest, route) =>
          authorizeRickAgentRequest(hookRequest, route, env),
        onBeforeRequest: (hookRequest, route) =>
          authorizeRickAgentRequest(hookRequest, route, env),
      });

      return response ?? new Response("Not found", { status: 404 });
    }

    return await serverEntry.fetch(request);
  },
  async queue(batch: MessageBatch<EmailQueueMessage>, env: Env): Promise<void> {
    if (batch.queue === EMAIL_QUEUE) {
      await processEmailBatch(batch, env);
      return;
    }

    // Image-gen is consumed by vbc-oos-announcement-image-gen (separate Worker).
    for (const message of batch.messages) {
      message.ack();
    }
  },
} satisfies ExportedHandler<Env, EmailQueueMessage>;
