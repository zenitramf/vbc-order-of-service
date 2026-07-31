import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_ROLE_ATTR,
  buildDesignPresetProject,
  getStylePack,
  listStylePacks,
  roleSelector,
} from "./announcement-style-library";

const sampleContent = {
  heading: "Sunday Service",
  subtitle: "Join us this week",
  tertiary: "Doors open at 9:30 AM",
  title: "Welcome Home",
};

const projectJson = (project: unknown): string => JSON.stringify(project);

describe("announcement-style-library", () => {
  it("exposes dramatic layout presets with unique ids", () => {
    const packs = listStylePacks();
    expect(packs.length).toBeGreaterThanOrEqual(6);

    const ids = packs.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);

    const compositions = new Set(packs.map((pack) => pack.composition));
    expect(compositions.size).toBeGreaterThanOrEqual(6);

    for (const pack of packs) {
      expect(pack.name.trim().length).toBeGreaterThan(0);
      expect(pack.description.trim().length).toBeGreaterThan(0);
      expect(pack.preview.compositionLabel.trim().length).toBeGreaterThan(0);
      expect(typeof pack.buildProject).toBe("function");
    }
  });

  it("resolves packs by id", () => {
    expect(getStylePack("classic-bottom")?.name).toBe("Classic bottom");
    expect(getStylePack("two-panel")?.composition).toBe("two-panel");
    expect(getStylePack("missing-pack")).toBeNull();
  });

  it("builds role selectors", () => {
    expect(roleSelector("title")).toBe(`[${ANNOUNCEMENT_ROLE_ATTR}="title"]`);
  });

  it("builds GrapesJS project JSON with content and roles for every preset", () => {
    for (const pack of listStylePacks()) {
      const project = pack.buildProject(sampleContent);
      const json = projectJson(project);

      expect(project.pages).toBeDefined();
      expect(Array.isArray(project.pages)).toBe(true);
      expect(json).toContain("1920px");
      expect(json).toContain("1080px");
      expect(json).toContain("Welcome Home");
      expect(json).toContain("Sunday Service");
      expect(json).toContain("Join us this week");
      expect(json).toContain("Doors open at 9:30 AM");
      expect(json).toContain(`${ANNOUNCEMENT_ROLE_ATTR}`);
      expect(json).toContain("title");
      expect(json).toContain("heading");
      // Never embed a photo URL — Body variation owns the image.
      expect(json).not.toMatch(/url\s*\(\s*["']?(?:https?:|data:|blob:)/iu);
      expect(json).toMatch(/transparent/iu);
    }
  });

  it("uses distinct structure across compositions", () => {
    const lowerLeft = buildDesignPresetProject("lower-left", sampleContent);
    const centered = buildDesignPresetProject("centered-hero", sampleContent);
    const twoPanel = buildDesignPresetProject("two-panel", sampleContent);
    const leftPanel = buildDesignPresetProject("left-panel", sampleContent);

    expect(lowerLeft).not.toBeNull();
    expect(centered).not.toBeNull();
    expect(twoPanel).not.toBeNull();
    expect(leftPanel).not.toBeNull();

    const centeredJson = projectJson(centered);
    const lowerLeftJson = projectJson(lowerLeft);
    const twoPanelJson = projectJson(twoPanel);
    const leftPanelJson = projectJson(leftPanel);

    expect(centeredJson).toContain("center");
    expect(centeredJson).toContain("scrim-top");

    expect(lowerLeftJson).toContain("58%");
    expect(lowerLeftJson).toContain("scrim-left");

    expect(twoPanelJson).toContain("border-right");
    expect(twoPanelJson).toContain("panel");

    expect(leftPanelJson).toContain("48%");
    expect(leftPanelJson).toContain("panel");
    expect(leftPanelJson).toContain("100px");
    expect(centeredJson).toContain("140px");
  });

  it("stores content as plain text (not HTML-escaped entities)", () => {
    const project = buildDesignPresetProject("classic-bottom", {
      heading: "<script>alert(1)</script>",
      subtitle: "A & B",
      tertiary: 'Say "hello"',
      title: "Title <em>x</em>",
    });

    expect(project).not.toBeNull();
    const json = projectJson(project);
    // GrapesJS stores text as component content strings, not HTML markup.
    expect(json).toContain("<script>alert(1)</script>");
    expect(json).toContain("A & B");
    // JSON encodes double quotes in strings as \"
    expect(json).toContain('Say \\"hello\\"');
    expect(json).toContain("Title <em>x</em>");
    // No HTML entity encoding — content is JSON text, not an HTML template.
    expect(json).not.toContain("&lt;script&gt;");
  });

  it("returns null for unknown preset ids", () => {
    expect(buildDesignPresetProject("nope", sampleContent)).toBeNull();
  });

  it("omits empty content fields instead of placeholder copy", () => {
    const project = buildDesignPresetProject("corner-card", {
      heading: "",
      subtitle: "Join us",
      tertiary: "",
      title: "Welcome",
    });

    expect(project).not.toBeNull();
    const json = projectJson(project);
    expect(json).toContain("Welcome");
    expect(json).toContain("Join us");
    expect(json).toContain('"title"');
    expect(json).toContain('"subtitle"');
    expect(json).not.toContain("Announcement Title");
    expect(json).not.toContain('"heading"');
    expect(json).not.toContain('"body"');
  });

  it("renders no text roles when all content fields are empty", () => {
    const project = buildDesignPresetProject("classic-bottom", {
      heading: "",
      subtitle: "",
      tertiary: "",
      title: "",
    });

    expect(project).not.toBeNull();
    const json = projectJson(project);
    expect(json).toContain("pages");
    expect(json).not.toContain('"heading"');
    expect(json).not.toContain('"title"');
    expect(json).not.toContain('"subtitle"');
    expect(json).not.toContain('"body"');
    expect(json).not.toContain("Announcement Title");
  });

  it("omits empty fields in two-panel layout", () => {
    const project = buildDesignPresetProject("two-panel", {
      heading: "",
      subtitle: "",
      tertiary: "Details only",
      title: "Main title",
    });

    expect(project).not.toBeNull();
    const json = projectJson(project);
    expect(json).toContain("Main title");
    expect(json).toContain("Details only");
    expect(json).not.toContain('"heading"');
    expect(json).not.toContain('"subtitle"');
  });
});
