import { describe, expect, it } from "vitest";

import { decodeDbText, parseTemplateJson } from "~/lib/template-json";

const TEMPLATE_JSON = JSON.stringify({
  name: "Sunday Service",
  service_type: [
    {
      activities: [
        { activityName: "Welcome", activityType: "custom", id: "a1" },
      ],
      id: "card1",
      typeName: "Opening",
    },
  ],
});

describe("decodeDbText", () => {
  it("passes strings through unchanged", () => {
    expect(decodeDbText("hello")).toBe("hello");
  });

  it("decodes Uint8Array values returned for BLOB columns", () => {
    expect(decodeDbText(new TextEncoder().encode("héllo"))).toBe("héllo");
  });

  it("decodes ArrayBuffer values returned for BLOB columns", () => {
    const bytes = new TextEncoder().encode("buffered");

    expect(decodeDbText(bytes.buffer)).toBe("buffered");
  });

  it("returns an empty string for non-text values", () => {
    expect(decodeDbText(null)).toBe("");
    expect(decodeDbText({})).toBe("");
    expect(decodeDbText(42)).toBe("");
  });
});

describe("parseTemplateJson", () => {
  it("parses a plain JSON string", () => {
    const template = parseTemplateJson(TEMPLATE_JSON, "Fallback");

    expect(template.name).toBe("Sunday Service");
    expect(template.service_type).toHaveLength(1);
    expect(template.service_type[0]?.activities[0]?.activityName).toBe(
      "Welcome"
    );
  });

  it("parses JSON stored as BLOB bytes instead of TEXT", () => {
    const template = parseTemplateJson(
      new TextEncoder().encode(TEMPLATE_JSON),
      "Fallback"
    );

    expect(template.name).toBe("Sunday Service");
    expect(template.service_type).toHaveLength(1);
  });

  it("treats empty values as an empty template instead of throwing", () => {
    for (const empty of ["", "   ", null, undefined]) {
      expect(parseTemplateJson(empty, "Fallback")).toEqual({
        name: "Fallback",
        service_type: [],
      });
    }
  });

  it("still throws on corrupt non-empty JSON", () => {
    expect(() => parseTemplateJson("{not json", "Fallback")).toThrow();
  });
});
