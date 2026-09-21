import { describe, expect, it } from "vitest";

import { parseCanvasPlan } from "~/lib/announcement-ai-plan";
import {
  buildDesignPresetHtml,
  legacyProjectDataToOverlayHtml,
  renderCanvasPlanToHtml,
  renderComponentDefToHtml,
} from "~/lib/announcement-overlay-render";
import { buildDesignPresetProject } from "~/lib/announcement-style-library";
import type { AnnouncementContent } from "~/lib/announcement-types";

const content: AnnouncementContent = {
  heading: "THIS SUNDAY",
  subtitle: "Starting October 4th",
  tertiary: "9am · 10am · 5pm",
  title: "New Service Times",
};

describe("renderComponentDefToHtml", () => {
  it("renders tag, inline style, attributes, and escaped text", () => {
    const html = renderComponentDefToHtml({
      attributes: { "data-ann-role": "title" },
      content: "A & B < C",
      style: { color: "#fff", "font-size": "40px" },
      tagName: "h1",
      type: "text",
    });

    expect(html).toContain("<h1");
    expect(html).toContain('data-ann-role="title"');
    expect(html).toContain("color:#fff");
    expect(html).toContain("font-size:40px");
    expect(html).toContain("A &amp; B &lt; C");
    expect(html).toContain("</h1>");
  });

  it("passes authored inline HTML content through unescaped", () => {
    const html = renderComponentDefToHtml({
      content: "Line one<br>Line two",
      tagName: "p",
      type: "text",
    });

    expect(html).toContain("Line one<br>Line two");
  });

  it("recurses into child components", () => {
    const html = renderComponentDefToHtml({
      components: [
        { content: "child", tagName: "span", type: "text" },
      ],
      tagName: "div",
    });

    expect(html).toContain("<div><span>child</span></div>");
  });
});

describe("buildDesignPresetHtml", () => {
  it("renders every preset to a self-contained overlay with the content text", () => {
    const packIds = [
      "classic-bottom",
      "lower-left",
      "centered-hero",
      "top-banner",
      "left-panel",
      "right-panel",
      "two-panel",
      "corner-card",
    ];

    for (const packId of packIds) {
      const html = buildDesignPresetHtml(packId, content);
      expect(html, packId).not.toBeNull();
      expect(html as string, packId).toContain("announcement-overlay");
      expect(html as string, packId).toContain("New Service Times");
      expect(html as string, packId).toContain("Starting October 4th");
    }
  });

  it("returns null for an unknown preset", () => {
    expect(buildDesignPresetHtml("does-not-exist", content)).toBeNull();
  });

  it("never embeds a background photo url in the overlay", () => {
    const html = buildDesignPresetHtml("classic-bottom", content) ?? "";
    expect(html).not.toMatch(/url\(/iu);
  });
});

describe("renderCanvasPlanToHtml", () => {
  it("renders a preset-based plan with updated role text", () => {
    const plan = parseCanvasPlan({
      basePresetId: "classic-bottom",
      mode: "rebuild",
      ops: [
        { op: "applyPreset", packId: "classic-bottom" },
        { content: "Overridden Title", op: "updateRole", role: "title" },
      ],
      version: 1,
    });

    const html = renderCanvasPlanToHtml(plan, content);
    expect(html).toContain("announcement-overlay");
    expect(html).toContain("Overridden Title");
  });
});

describe("legacyProjectDataToOverlayHtml", () => {
  it("migrates a legacy GrapesJS project blob to overlay HTML", () => {
    const project = buildDesignPresetProject("classic-bottom", content);
    const html = legacyProjectDataToOverlayHtml(project);

    expect(html).not.toBeNull();
    expect(html as string).toContain("announcement-overlay");
    expect(html as string).toContain("New Service Times");
  });

  it("returns null for an unusable blob", () => {
    expect(legacyProjectDataToOverlayHtml(null)).toBeNull();
    expect(legacyProjectDataToOverlayHtml({})).toBeNull();
    expect(legacyProjectDataToOverlayHtml({ pages: [] })).toBeNull();
  });
});
