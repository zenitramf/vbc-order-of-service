/**
 * Tiny OpenAI-compatible mock used to exercise Rick locally without a
 * Cloudflare login (the local AI binding is remote-only).
 *
 *   node scripts/mock-llm-server.mjs            # listens on :8788
 *   RICK_DEV_BASE_URL=http://127.0.0.1:8788/v1  # sidecar .dev.vars
 *
 * It streams a short reply, and scripts `list_orders` / `delete_order` tool
 * calls so the MCP tools and the approval UI can be validated end to end.
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

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const lastUser = [...messages]
    .toReversed()
    .find((message) => message.role === "user");
  const userText = textOf(lastUser?.content).toLowerCase();
  const hasToolResult = messages.some((message) => message.role === "tool");

  const summary = summarizeToolResult(messages);

  if (hasToolResult && summary) {
    streamText(res, summary);
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
