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
            background: 'url("https://evil.example/x.png")',
            color: "#ffffff",
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
    ).toThrow(/Invalid canvas plan/u);
  });

  it("rejects unknown pack ids", () => {
    expect(() =>
      parseCanvasPlan({
        mode: "rebuild",
        ops: [{ op: "applyPreset", packId: "not-a-pack" }],
        version: 1,
      })
    ).toThrow(/Invalid canvas plan/u);
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

describe("parseCanvasPlan — model drift tolerance", () => {
  it("accepts the shape produced in prod (camelCase styles + off-spec roles) instead of throwing", () => {
    // This is the exact style the layout model emitted that used to reject the
    // whole plan and surface as a failing "Generate with AI" button.
    const plan = parseCanvasPlan({
      basePresetId: "classic-bottom",
      mode: "rebuild",
      ops: [
        { op: "clear" },
        { op: "applyPreset", packId: "classic-bottom" },
        {
          op: "updateRole",
          role: "scrim",
          style: {
            background: "linear-gradient(to top, rgba(0,0,0,0.8), transparent)",
          },
        },
        {
          content: "New Service Times",
          op: "updateRole",
          role: "title",
          style: {
            color: "#fff",
            fontFamily: "Georgia, serif",
            fontSize: "72px",
          },
        },
        {
          content: "9am\n10am\n5pm",
          op: "updateRole",
          role: "body",
          style: { fontSize: "26px", whiteSpace: "pre-line" },
        },
      ],
      version: 1,
    });

    // 'scrim' is coerced to 'scrim-bottom'; camelCase keys become kebab-case.
    const title = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "title"
    );
    expect(title).toBeDefined();
    if (title && title.op === "updateRole") {
      expect(title.style?.["font-size"]).toBe("72px");
      expect(title.style?.["font-family"]).toContain("Georgia");
      expect(title.style?.fontSize).toBeUndefined();
    }

    const scrim = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "scrim-bottom"
    );
    expect(scrim, "role 'scrim' should coerce to 'scrim-bottom'").toBeDefined();

    const body = plan.ops.find(
      (op) => op.op === "updateRole" && op.role === "body"
    );
    expect(body && body.op === "updateRole" && body.content).toBe(
      "9am\n10am\n5pm"
    );
  });

  it("drops an updateRole op whose role cannot be mapped", () => {
    const plan = parseCanvasPlan({
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "classic-bottom" },
        { content: "x", op: "updateRole", role: "totally-unknown-role" },
      ],
      version: 1,
    });

    expect(
      plan.ops.some(
        (op) => op.op === "updateRole" && op.role === "totally-unknown-role"
      )
    ).toBe(false);
  });
});
