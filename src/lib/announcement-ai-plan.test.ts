import { describe, expect, it } from "vitest";

import {
  extractStructuredJson,
  normalizeCanvasPlan,
  parseCanvasPlan,
} from "~/lib/announcement-ai-plan";

describe("parseCanvasPlan", () => {
  it("accepts a preset-first rebuild plan", () => {
    const plan = parseCanvasPlan({
      basePresetId: "classic-bottom",
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "classic-bottom" },
        {
          op: "updateRole",
          role: "title",
          style: { color: "#fbbf24" },
        },
      ],
      version: 1,
    });

    expect(plan.version).toBe(1);
    expect(plan.ops[0]).toEqual({
      op: "applyPreset",
      packId: "classic-bottom",
    });
    expect(plan.ops[1]).toMatchObject({
      op: "updateRole",
      role: "title",
      style: { color: "#fbbf24" },
    });
  });

  it("injects classic-bottom when ops have no structural base", () => {
    const plan = parseCanvasPlan({
      mode: "rebuild",
      ops: [
        {
          op: "updateRole",
          role: "title",
          style: { "font-size": "120px" },
        },
      ],
      version: 1,
    });

    expect(plan.ops[0]).toEqual({
      op: "applyPreset",
      packId: "classic-bottom",
    });
  });

  it("coerces solid scrim backgrounds to alpha gradients", () => {
    const plan = parseCanvasPlan({
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "left-panel" },
        {
          op: "updateRole",
          role: "scrim-bottom",
          style: { "background-color": "#000000" },
        },
      ],
      version: 1,
    });

    const update = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "scrim-bottom"
    );
    expect(update && update.op === "updateRole" ? update.style : null).toEqual(
      expect.objectContaining({
        background: expect.stringContaining("gradient"),
        "background-color": "transparent",
      })
    );
  });

  it("strips url() and photo style keys", () => {
    const plan = normalizeCanvasPlan({
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "classic-bottom" },
        {
          op: "setStageStyle",
          style: {
            "background-image": 'url("https://evil.example/photo.jpg")',
            "font-family": "Georgia, serif",
          },
        },
        {
          op: "updateRole",
          role: "title",
          style: {
            color: "#ffffff",
            background: 'url("https://evil.example/x.png")',
          },
        },
      ],
      version: 1,
    });

    const stage = plan.ops.find((op) => op.op === "setStageStyle");
    expect(stage && stage.op === "setStageStyle" ? stage.style : null).toEqual({
      "font-family": "Georgia, serif",
    });

    const title = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "title"
    );
    expect(title && title.op === "updateRole" ? title.style : null).toEqual({
      color: "#ffffff",
    });
  });

  it("strips HTML tags from content", () => {
    const plan = parseCanvasPlan({
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "classic-bottom" },
        {
          content: "<script>alert(1)</script>Hello",
          op: "updateRole",
          role: "title",
        },
      ],
      version: 1,
    });

    const title = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "title"
    );
    // Tags removed; remaining plain text kept.
    expect(title && title.op === "updateRole" ? title.content : null).toBe(
      "alert(1)Hello"
    );
  });

  it("rejects invalid version / mode", () => {
    expect(() =>
      parseCanvasPlan({
        mode: "rebuild",
        ops: [],
        version: 2,
      })
    ).toThrow(/Invalid canvas plan/);
  });

  it("rejects unknown pack ids", () => {
    expect(() =>
      parseCanvasPlan({
        mode: "rebuild",
        ops: [{ op: "applyPreset", packId: "not-a-pack" }],
        version: 1,
      })
    ).toThrow(/Invalid canvas plan/);
  });
});

describe("extractStructuredJson", () => {
  it("parses string content from OpenAI-shaped choices", () => {
    const value = extractStructuredJson({
      choices: [
        {
          message: {
            content: JSON.stringify({
              mode: "rebuild",
              ops: [{ op: "applyPreset", packId: "classic-bottom" }],
              version: 1,
            }),
          },
        },
      ],
    });

    expect(value).toMatchObject({ mode: "rebuild", version: 1 });
  });

  it("returns already-parsed response objects", () => {
    const value = extractStructuredJson({
      response: {
        mode: "rebuild",
        ops: [],
        version: 1,
      },
    });

    expect(value).toMatchObject({ version: 1 });
  });

  it("strips markdown fences", () => {
    const value = extractStructuredJson({
      response: '```json\n{"version":1,"mode":"rebuild","ops":[]}\n```',
    });

    expect(value).toMatchObject({ mode: "rebuild", version: 1 });
  });
});
