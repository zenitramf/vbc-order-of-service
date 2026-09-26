/**
 * Rick — the portal's in-app chat assistant.
 *
 * Runs as an `AIChatAgent` Durable Object on this slim Worker so model calls
 * never share an isolate with TanStack Start / GrapesJS. One DO per portal
 * user (the DO instance name is the Better Auth user id, validated by the
 * main app before the WebSocket upgrade reaches us).
 */
import type {
  ChatResponseResult,
  MessageConcurrency,
  OnChatMessageOptions,
} from "@cloudflare/ai-chat";
import { AIChatAgent } from "@cloudflare/ai-chat";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { GenerateTextOnFinishCallback, ToolSet } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  pruneMessages,
  stepCountIs,
  streamText,
} from "ai";
import { createUnified } from "ai-gateway-provider/providers/unified";

import { signRickAgentToken } from "../../../src/lib/rick-agent-token";
import { createRickMcpSession } from "./rick-mcp";
import type { RickMcpSession } from "./rick-mcp";

const DEFAULT_MODEL = "openai/gpt-6-luna";
const DAILY_MESSAGE_LIMIT = 50;
const MAX_OUTPUT_TOKENS = 4000;
const MAX_TOOL_STEPS = 8;
const PACIFIC_TIME_ZONE = "America/Los_Angeles";

const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;
type ReasoningEffort = (typeof REASONING_EFFORTS)[number];
const DEFAULT_REASONING_EFFORT: ReasoningEffort = "medium";

const parseReasoningEffort = (value: string | undefined): ReasoningEffort =>
  REASONING_EFFORTS.find((effort) => effort === value?.trim()) ??
  DEFAULT_REASONING_EFFORT;

/** Secrets and local-dev vars that are not part of the generated Env type. */
type RickAgentEnv = Env & {
  OPENROUTER_API_KEY?: string;
  RICK_AGENT_TOKEN_SECRET?: string;
  RICK_DEV_BASE_URL?: string;
  RICK_MODEL?: string;
  RICK_REASONING_EFFORT?: string;
};

const formatPacificDay = (now: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: PACIFIC_TIME_ZONE }).format(now);

/**
 * Local mock compatibility: OpenAI-compatible chat completions reject
 * `max_tokens` and want `max_completion_tokens`.
 */
const renameMaxTokens = (
  body: Record<string, unknown>
): Record<string, unknown> => {
  if (typeof body.max_tokens !== "number") {
    return body;
  }

  const next: Record<string, unknown> = {
    ...body,
    max_completion_tokens: body.max_tokens,
  };

  delete next.max_tokens;

  return next;
};

/**
 * Production talks to OpenRouter directly with our own API key — the previous
 * AI Gateway unified-billing path caps paid models at 50 requests/min per
 * account, which a single agentic chat turn (tool steps + retries) can burst
 * past. OpenRouter applies its own per-key limits instead.
 */
const createRickModel = (env: RickAgentEnv) => {
  const modelId = env.RICK_MODEL?.trim() || DEFAULT_MODEL;
  const devBaseUrl = env.RICK_DEV_BASE_URL?.trim();

  // Local development without Cloudflare auth: chat-completions against the
  // mock server (no reasoning, but the whole agent loop still runs).
  if (devBaseUrl) {
    return createUnified({
      apiKey: "rick-local-dev",
      baseURL: devBaseUrl,
      name: "RickLocal",
      transformRequestBody: renameMaxTokens,
    })(modelId);
  }

  const apiKey = env.OPENROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set on the Rick Worker.");
  }

  return createOpenRouter({ apiKey })(modelId);
};

const buildSystemPrompt = ({
  body,
  date,
}: {
  body?: Record<string, unknown>;
  date: string;
}): string => {
  const pathname =
    typeof body?.pathname === "string" ? body.pathname : "unavailable";
  const pageTitle =
    typeof body?.pageTitle === "string" ? body.pageTitle : "unavailable";
  const params =
    typeof body?.params === "object" && body.params !== null
      ? JSON.stringify(body.params)
      : "{}";

  return `You are Rick, a warm and friendly church-staff helper for Victory Bible Church (Fresno Victory).
You help staff and volunteers plan orders of service, month plans, templates, teams,
members, hymns, and announcements inside the VBC portal.

- Be warm, encouraging, and concise. Use plain language; avoid jargon.
- Use your tools to look things up rather than guessing. Never invent IDs, dates, or hymns.
- Before changing, publishing, emailing, or deleting anything, summarise exactly what
  will happen; the portal will ask the user to approve.
- Prefer dry_run first for publish/email and share the preview.
- If a tool returns a permission error, kindly explain the user doesn't have access.

Current page: ${pageTitle} (${pathname}) with route params ${params}.
Today is ${date} (America/Los_Angeles).`;
};

/** A UI-message stream that contains one assistant text answer. */
const textResponse = (text: string): Response => {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID();

      writer.write({ id, type: "text-start" });
      writer.write({ delta: text, id, type: "text-delta" });
      writer.write({ id, type: "text-end" });
    },
  });

  return createUIMessageStreamResponse({ stream });
};

export class RickAgent extends AIChatAgent<Env> {
  maxPersistedMessages = 200;
  messageConcurrency: MessageConcurrency = "latest";

  private mcpSession: RickMcpSession | null = null;

  override async onChatMessage(
    _onFinish: GenerateTextOnFinishCallback<ToolSet>,
    options?: OnChatMessageOptions
  ): Promise<Response> {
    const env = this.env as RickAgentEnv;
    const userId = this.name;
    const date = formatPacificDay(new Date());

    if (!(options?.continuation ?? false) && !this.tryConsumeQuota(date)) {
      return textResponse(
        "I've reached today's message limit — I'll be ready to help again tomorrow. 🙏"
      );
    }

    const secret = env.RICK_AGENT_TOKEN_SECRET;

    if (!secret) {
      return textResponse(
        "Rick isn't configured yet. Ask an admin to set the RICK_AGENT_TOKEN_SECRET secret on both Workers."
      );
    }

    let session: RickMcpSession;

    try {
      session = await createRickMcpSession({
        fetchPortal: (request) => env.PORTAL.fetch(request),
        token: await signRickAgentToken({ secret, userId }),
      });
    } catch {
      return textResponse(
        "I couldn't reach the portal just now. Please try that again in a moment."
      );
    }

    this.mcpSession = session;

    let model: ReturnType<typeof createRickModel>;

    try {
      model = createRickModel(env);
    } catch {
      return textResponse(
        "Rick isn't configured yet. Ask an admin to set the OPENROUTER_API_KEY secret on the Rick Worker."
      );
    }

    const result = streamText({
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // One retry keeps a transient blip from failing the turn without
      // tripling request volume against per-minute rate limits.
      maxRetries: 1,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
      }),
      model,
      onFinish: () => this.closeMcpSession(),
      providerOptions: {
        openrouter: {
          reasoning: {
            effort: parseReasoningEffort(env.RICK_REASONING_EFFORT),
          },
        },
      },
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      system: buildSystemPrompt({ body: options?.body, date }),
      tools: session.tools,
    });

    return result.toUIMessageStreamResponse({
      onError: (error) =>
        error instanceof Error &&
        error.message.startsWith("Permission required")
          ? error.message
          : "Something went wrong. Please try again.",
    });
  }

  protected override async onChatResponse(
    _result: ChatResponseResult
  ): Promise<void> {
    await this.closeMcpSession();
  }

  private async closeMcpSession(): Promise<void> {
    const session = this.mcpSession;
    this.mcpSession = null;

    if (!session) {
      return;
    }

    try {
      await session.client.close();
    } catch {
      // The portal connection is already gone; nothing left to clean up.
    }
  }

  /** One message per user per Pacific day, capped in the DO's own SQLite. */
  private tryConsumeQuota(day: string): boolean {
    void this
      .sql`CREATE TABLE IF NOT EXISTS rick_chat_quota (day TEXT PRIMARY KEY, messages INTEGER NOT NULL DEFAULT 0)`;

    const rows = this.sql<{
      messages: number;
    }>`SELECT messages FROM rick_chat_quota WHERE day = ${day}`;
    const used = rows.at(0)?.messages ?? 0;

    if (used >= DAILY_MESSAGE_LIMIT) {
      return false;
    }

    void this
      .sql`INSERT INTO rick_chat_quota (day, messages) VALUES (${day}, 1) ON CONFLICT(day) DO UPDATE SET messages = messages + 1`;

    return true;
  }
}
