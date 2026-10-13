/**
 * Tiny OpenAI-compatible mock used to exercise Rick locally without a
 * Cloudflare login (the local AI binding is remote-only).
 *
 *   node scripts/mock-llm-server.mjs            # listens on :8788
 *   RICK_DEV_BASE_URL=http://127.0.0.1:8788/v1  # sidecar .dev.vars
 *
 * It streams a short reply, and scripts `list_orders` / `delete_order` tool
 * calls so the MCP tools and the approval UI can be validated end to end.
 * Ask about "lyrics" for a hymn (e.g. “add lyrics to hymn <id>”) and it
 * scripts activate_skill → update_hymn (deliberately messy lyrics with a
 * repeated chorus) → get_hymn, so the hymn-lyrics skill and the portal's
 * lyrics-layout enforcement can be validated end to end.
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_LLM_PORT ?? 8788);
const MODEL = process.env.MOCK_LLM_MODEL ?? "openai/gpt-6-luna";

const chunk = (delta, finishReason = null) =>
  `data: ${JSON.stringify({
    choices: [{ delta, finish_reason: finishReason, index: 0 }],
    created: Math.floor(Date.now() / 1000),
    id: `chatcmpl-mock-${Date.now()}`,
    model: MODEL,
    object: "chat.completion.chunk",
  })}\n\n`;

const startStream = (res) => {
  res.writeHead(200, {
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
};

const endStream = (res) => {
  res.write("data: [DONE]\n\n");
  res.end();
};

const streamText = (res, text) => {
  startStream(res);
  res.write(chunk({ content: "", role: "assistant" }));
  for (const word of text.split(" ")) {
    res.write(chunk({ content: `${word} ` }));
  }
  res.write(chunk({}, "stop"));
  endStream(res);
};

const streamToolCall = (res, name, args) => {
  const callId = `call_mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  startStream(res);
  res.write(
    chunk({
      role: "assistant",
      tool_calls: [
        {
          function: { arguments: "", name },
          id: callId,
          index: 0,
          type: "function",
        },
      ],
    })
  );
  res.write(
    chunk({
      tool_calls: [{ function: { arguments: JSON.stringify(args) }, index: 0 }],
    })
  );
  res.write(chunk({}, "tool_calls"));
  endStream(res);
};

const textOf = (content) => {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join(" ");
  }

  return "";
};

const readBody = async (req) => {
  const chunks = [];

  for await (const data of req) {
    chunks.push(data);
  }

  const raw = Buffer.concat(chunks).toString("utf-8");

  return raw ? JSON.parse(raw) : {};
};

const attachmentCount = (content) =>
  Array.isArray(content)
    ? content.filter(
        (part) => part?.type === "image_url" || part?.type === "file"
      ).length
    : 0;

const summarizeToolResult = (messages) => {
  const lastTool = [...messages].toReversed().find((m) => m.role === "tool");

  if (!lastTool) {
    return null;
  }

  const text = textOf(lastTool.content);

  if (/permission required/iu.test(text)) {
    return `I couldn't do that — ${text.trim()}`;
  }

  try {
    const parsed = JSON.parse(text);

    if (parsed?.success === true) {
      return "Done — the portal confirmed that change.";
    }

    const list = Array.isArray(parsed) ? parsed : parsed?.orders;

    if (Array.isArray(list)) {
      return `I found ${list.length} order(s). The first is "${
        list[0]?.title ?? "untitled"
      }".`;
    }
  } catch {
    // fall through to a generic answer
  }

  return "I checked the portal and got a result back.";
};

/** Deliberately non-canonical: Spanish labels, chorus repeated after Verse 2. */
const MESSY_LYRICS = `[Estrofa 1]
Cristo tanto me amó,
Que en la cruz por mí murió;

Coro:
Al Cordero gloria,
¡Dad al Cordero gloria!

[Estrofa 2]
Dios al mundo descendió;
Mas con poder resucitó.

Coro:
Al Cordero gloria,
¡Dad al Cordero gloria!`;

const calledToolNames = (messages) => {
  const names = new Set();

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.tool_calls)) {
      continue;
    }

    for (const call of message.tool_calls) {
      if (typeof call?.function?.name === "string") {
        names.add(call.function.name);
      }
    }
  }

  return names;
};

const findHymnId = (userText) => {
  const match = /\bhymn\s+(?<id>[\w-]{6,})/u.exec(userText);

  return match?.groups?.id ?? "demo-hymn";
};

const summarizeHymnLyrics = (messages) => {
  const lastTool = [...messages].toReversed().find((m) => m.role === "tool");
  const text = textOf(lastTool?.content);

  try {
    const parsed = JSON.parse(text);
    const lyrics =
      typeof parsed?.lyricsMarkdown === "string" ? parsed.lyricsMarkdown : "";
    const chorusCount = (lyrics.match(/^Chorus$/gmu) ?? []).length;

    if (lyrics) {
      return `Done — the stored lyrics are in the standard layout and “Chorus” appears ${chorusCount} time(s). They begin: ${lyrics.split("\n").slice(0, 3).join(" / ")}`;
    }
  } catch {
    // fall through to a generic answer
  }

  return "Done — I saved those lyrics and read the hymn back.";
};

const findOrderId = (messages) => {
  for (const message of [...messages].toReversed()) {
    if (message.role !== "tool") {
      continue;
    }

    const raw =
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content);
    const match = /"id"\s*:\s*"(?<id>[^"]+)"/u.exec(raw.replaceAll('\\"', '"'));

    if (match?.groups?.id) {
      return match.groups.id;
    }
  }

  return "demo-order-2";
};

const respond = async (req, res) => {
  if (req.method !== "POST") {
    res.writeHead(405).end();
    return;
  }

  let body;

  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400).end();
    return;
  }

  // Mirror production OpenAI models: `max_tokens` is rejected in favour of
  // `max_completion_tokens`, so the sidecar's request transform is exercised.
  if (typeof body.max_tokens === "number") {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: {
          code: "unsupported_parameter",
          message:
            "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
          param: "max_tokens",
          type: "invalid_request_error",
        },
      })
    );
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages]
    .toReversed()
    .find((message) => message.role === "user");
  const userText = textOf(lastUser?.content).toLowerCase();
  const hasToolResult = messages.some((message) => message.role === "tool");

  // Hymn-lyrics skill flow: activate → save messy lyrics → read back.
  if (/lyric/u.test(userText)) {
    const called = calledToolNames(messages);
    const hymnId = findHymnId(userText);

    if (!called.has("activate_skill")) {
      streamToolCall(res, "activate_skill", { name: "hymn-lyrics" });
      return;
    }

    if (!called.has("update_hymn")) {
      streamToolCall(res, "update_hymn", { id: hymnId, lyrics: MESSY_LYRICS });
      return;
    }

    if (!called.has("get_hymn")) {
      streamToolCall(res, "get_hymn", { id: hymnId });
      return;
    }

    streamText(res, summarizeHymnLyrics(messages));
    return;
  }

  const summary = summarizeToolResult(messages);

  if (hasToolResult && summary) {
    streamText(res, summary);
    return;
  }

  const attachments = attachmentCount(lastUser?.content);

  if (attachments > 0) {
    streamText(
      res,
      `I received ${attachments} attachment(s) with your message. The local mock can't read them, but they reached the model request.`
    );
    return;
  }

  if (/(?:delete|remove)/u.test(userText)) {
    streamToolCall(res, "delete_order", { id: findOrderId(messages) });
    return;
  }

  if (/order/u.test(userText)) {
    streamToolCall(res, "list_orders", {});
    return;
  }

  streamText(
    res,
    `Hi! I'm Rick (running against the local mock model). You said: "${
      textOf(lastUser?.content) || "hello"
    }".`
  );
};

const server = createServer(async (req, res) => {
  try {
    await respond(req, res);
  } catch {
    res.writeHead(500).end();
  }
});

server.listen(PORT, () => {
  console.log(`mock LLM listening on http://127.0.0.1:${PORT}/v1`);
});
