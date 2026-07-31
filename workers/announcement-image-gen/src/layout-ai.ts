/**
 * Layout (CanvasPlan) generation via Workers AI / AI Gateway.
 * Self-contained — does not import GrapesJS or TanStack.
 */

import type { AnnouncementContent, CanvasPlanJson } from "./types";
import {
  ANNOUNCEMENT_HEIGHT,
  ANNOUNCEMENT_WIDTH,
  LAYOUT_MODEL,
  LAYOUT_MODEL_FALLBACK,
} from "./types";

const STYLE_PACK_META = [
  {
    composition: "bottom-band",
    description: "Classic lower band with title and supporting lines.",
    id: "classic-bottom",
    name: "Classic bottom",
  },
  {
    composition: "lower-left",
    description: "Lower-left stacked text with soft scrim.",
    id: "lower-left",
    name: "Lower left",
  },
  {
    composition: "centered",
    description: "Centered hero title with ambient scrim.",
    id: "centered-hero",
    name: "Centered hero",
  },
  {
    composition: "top-banner",
    description: "Top banner strip with supporting copy below.",
    id: "top-banner",
    name: "Top banner",
  },
  {
    composition: "left-panel",
    description: "Left panel column with text stack.",
    id: "left-panel",
    name: "Left panel",
  },
  {
    composition: "right-panel",
    description: "Right panel column with text stack.",
    id: "right-panel",
    name: "Right panel",
  },
  {
    composition: "two-panel",
    description: "Split two-panel layout.",
    id: "two-panel",
    name: "Two panel",
  },
  {
    composition: "corner-card",
    description: "Floating lower-left card.",
    id: "corner-card",
    name: "Corner card",
  },
] as const;

const BLOCK_IDS = [
  "ann-heading",
  "ann-title",
  "ann-subtitle",
  "ann-body",
  "ann-text-box",
  "ann-scrim",
  "ann-scrim-top",
  "ann-scrim-left",
  "ann-scrim-right",
  "ann-spacer",
  "ann-div",
  "ann-text",
  "ann-link",
] as const;

/**
 * JSON Schema for xAI structured outputs (canvas_plan).
 * Kept in sync with src/lib/announcement-ai-plan.ts canvasPlanSchema.
 */
const canvasPlanJsonSchema: Record<string, unknown> = {
  $schema: "http://json-schema.org/draft-07/schema#",
  additionalProperties: false,
  properties: {
    basePresetId: {
      anyOf: [
        {
          enum: STYLE_PACK_META.map((pack) => pack.id),
          type: "string",
        },
        { type: "null" },
      ],
    },
    mode: { const: "rebuild", type: "string" },
    ops: {
      items: {
        anyOf: [
          {
            additionalProperties: false,
            properties: { op: { const: "clear", type: "string" } },
            required: ["op"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              op: { const: "applyPreset", type: "string" },
              packId: {
                enum: STYLE_PACK_META.map((pack) => pack.id),
                type: "string",
              },
            },
            required: ["op", "packId"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              blockId: { enum: [...BLOCK_IDS], type: "string" },
              content: { maxLength: 2000, type: "string" },
              op: { const: "addBlock", type: "string" },
              parentRole: { type: "string" },
              role: { type: "string" },
              style: {
                additionalProperties: { type: "string" },
                type: "object",
              },
            },
            required: ["op", "blockId"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              content: { maxLength: 2000, type: "string" },
              index: { maximum: 20, minimum: 0, type: "integer" },
              op: { const: "updateRole", type: "string" },
              remove: { type: "boolean" },
              role: { type: "string" },
              style: {
                additionalProperties: { type: "string" },
                type: "object",
              },
            },
            required: ["op", "role"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: {
              op: { const: "setStageStyle", type: "string" },
              style: {
                additionalProperties: { type: "string" },
                type: "object",
              },
            },
            required: ["op", "style"],
            type: "object",
          },
        ],
      },
      maxItems: 40,
      type: "array",
    },
    version: { const: 1, type: "integer" },
  },
  required: ["mode", "ops", "version"],
  type: "object",
};

const layoutSystemPrompt = [
  "You design church announcement overlays for a 1920×1080 GrapesJS canvas.",
  "Your output is constrained to the canvas_plan JSON schema.",
  "Prefer: applyPreset with a known packId from the provided list, then optional updateRole style tweaks.",
  "Never paint photographic backgrounds (the variation photo is applied separately on the Body).",
  "Scrims/panels must use alpha linear-gradients fading to transparent (never solid opaque fills).",
  "Use content fields exactly as provided for text (no copy rewrite unless style notes request polish).",
  "Do not emit HTML. Do not emit GrapesJS project JSON. Only CanvasPlan ops.",
].join(" ");

const buildLayoutUserPayload = (options: {
  content: AnnouncementContent;
  styleNotes?: string;
}): string =>
  JSON.stringify(
    {
      availableBlocks: BLOCK_IDS,
      availablePresets: STYLE_PACK_META,
      canvas: {
        height: ANNOUNCEMENT_HEIGHT,
        width: ANNOUNCEMENT_WIDTH,
      },
      content: options.content,
      styleNotes:
        options.styleNotes?.trim() ||
        "Warm, reverent, modern church graphic. Bottom-weighted text with elegant serif title.",
    },
    null,
    2
  );

const layoutRequestInput = (userPayload: string): Record<string, unknown> => ({
  messages: [
    { content: layoutSystemPrompt, role: "system" },
    { content: userPayload, role: "user" },
  ],
  response_format: {
    json_schema: {
      name: "canvas_plan",
      schema: canvasPlanJsonSchema,
      strict: true,
    },
    type: "json_schema",
  },
  temperature: 0.4,
});

const parseJsonLoose = (raw: string): unknown => {
  const trimmed = raw.trim();
  const fenced =
    /^```(?:json)?\s*(?<body>[\s\S]*?)```$/iu.exec(trimmed)?.groups?.body ??
    trimmed;

  try {
    return JSON.parse(fenced.trim()) as unknown;
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");

    if (start !== -1 && end > start) {
      return JSON.parse(fenced.slice(start, end + 1)) as unknown;
    }

    throw new Error("AI did not return valid JSON for canvas plan.");
  }
};

const extractStructuredJson = (response: unknown): unknown => {
  if (response === null || response === undefined) {
    return null;
  }

  if (typeof response === "string") {
    return parseJsonLoose(response);
  }

  if (typeof response !== "object" || Array.isArray(response)) {
    return null;
  }

  const record = response as Record<string, unknown>;

  if (record.response && typeof record.response === "object") {
    return record.response;
  }

  if (typeof record.response === "string") {
    return parseJsonLoose(record.response);
  }

  const { choices } = record;
  if (Array.isArray(choices) && choices[0]) {
    const choice = choices[0] as Record<string, unknown>;
    const message = choice.message as Record<string, unknown> | undefined;
    const content = message?.content ?? choice.text;

    if (typeof content === "string") {
      return parseJsonLoose(content);
    }

    if (content && typeof content === "object") {
      return content;
    }
  }

  if ("version" in record && "ops" in record) {
    return record;
  }

  return null;
};

const coerceCanvasPlan = (raw: unknown): CanvasPlanJson => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Invalid canvas plan from AI: not an object.");
  }

  const record = raw as Record<string, unknown>;

  if (record.version !== 1) {
    throw new Error("Invalid canvas plan from AI: version must be 1.");
  }

  if (record.mode !== "rebuild") {
    throw new Error("Invalid canvas plan from AI: mode must be rebuild.");
  }

  if (!Array.isArray(record.ops)) {
    throw new TypeError("Invalid canvas plan from AI: ops must be an array.");
  }

  const { basePresetId: rawBasePresetId, ops } = record;
  let basePresetId: string | null | undefined;
  if (typeof rawBasePresetId === "string") {
    basePresetId = rawBasePresetId;
  } else if (rawBasePresetId === null) {
    basePresetId = null;
  } else {
    basePresetId = undefined;
  }

  return {
    basePresetId,
    mode: "rebuild",
    ops: ops.slice(0, 40),
    version: 1,
  };
};

export type RunAiGateway = (
  model: string,
  input: Record<string, unknown>
) => Promise<unknown>;

/**
 * Generate a CanvasPlan via AI Gateway. Caller provides runAiGateway so this
 * module stays free of env/bindings.
 */
export const generateLayoutPlanWithAi = async (
  options: {
    content: AnnouncementContent;
    styleNotes?: string;
  },
  runAiGateway: RunAiGateway
): Promise<CanvasPlanJson> => {
  const userPayload = buildLayoutUserPayload(options);
  const input = layoutRequestInput(userPayload);

  let response: unknown;
  try {
    response = await runAiGateway(LAYOUT_MODEL, input);
  } catch (primaryError) {
    try {
      response = await runAiGateway(LAYOUT_MODEL_FALLBACK, input);
    } catch {
      throw primaryError instanceof Error
        ? primaryError
        : new Error(String(primaryError));
    }
  }

  const structured = extractStructuredJson(response);

  if (structured === null) {
    throw new Error("AI Gateway returned empty layout plan.");
  }

  try {
    return coerceCanvasPlan(structured);
  } catch (firstError) {
    const repairPayload = JSON.stringify(
      {
        error:
          firstError instanceof Error
            ? firstError.message
            : "Invalid canvas plan",
        previous: structured,
        task: "Return a corrected canvas_plan that satisfies the schema.",
      },
      null,
      2
    );

    try {
      const repaired = await runAiGateway(LAYOUT_MODEL, {
        ...layoutRequestInput(repairPayload),
        temperature: 0.2,
      });
      return coerceCanvasPlan(extractStructuredJson(repaired));
    } catch {
      throw firstError instanceof Error
        ? firstError
        : new Error(String(firstError));
    }
  }
};
