import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_ROLE_ATTR,
  buildDesignPresetHtml,
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
      expect(typeof pack.buildHtml).toBe("function");
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

  it("builds full layout HTML with content and roles for every preset", () => {
    for (const pack of listStylePacks()) {
      const html = pack.buildHtml(sampleContent);

      expect(html).toContain("announcement-overlay");
      expect(html).toContain("1920px");
      expect(html).toContain("1080px");
      expect(html).toContain("Welcome Home");
      expect(html).toContain("Sunday Service");
      expect(html).toContain("Join us this week");
      expect(html).toContain("Doors open at 9:30 AM");
      expect(html).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="title"`);
      expect(html).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="heading"`);
      // Never embed a photo URL — Body variation owns the image.
      expect(html).not.toMatch(/url\s*\(\s*["']?(?:https?:|data:|blob:)/iu);
      expect(html).toMatch(/background:\s*transparent/iu);
    }
  });

  it("uses distinct structure across compositions", () => {
    const lowerLeft = buildDesignPresetHtml("lower-left", sampleContent);
    const centered = buildDesignPresetHtml("centered-hero", sampleContent);
    const twoPanel = buildDesignPresetHtml("two-panel", sampleContent);
    const leftPanel = buildDesignPresetHtml("left-panel", sampleContent);

    expect(lowerLeft).not.toBeNull();
    expect(centered).not.toBeNull();
    expect(twoPanel).not.toBeNull();
    expect(leftPanel).not.toBeNull();

    expect(centered).toContain("text-align:center");
    expect(centered).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="scrim-top"`);

    expect(lowerLeft).toContain("width:58%");
    expect(lowerLeft).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="scrim-left"`);

    expect(twoPanel).toContain("border-right");
    expect(twoPanel).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="panel"`);

    expect(leftPanel).toContain("width:44%");
    expect(leftPanel).toContain(`${ANNOUNCEMENT_ROLE_ATTR}="panel"`);
  });

  it("escapes HTML in content fields", () => {
    const html = buildDesignPresetHtml("classic-bottom", {
      heading: "<script>alert(1)</script>",
      subtitle: "A & B",
      tertiary: 'Say "hello"',
      title: "Title <em>x</em>",
    });

    expect(html).not.toBeNull();
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
    expect(html).toContain("&quot;hello&quot;");
    expect(html).toContain("Title &lt;em&gt;x&lt;/em&gt;");
  });

  it("returns null for unknown preset ids", () => {
    expect(buildDesignPresetHtml("nope", sampleContent)).toBeNull();
  });

  it("fills placeholder copy when content fields are empty", () => {
    const html = buildDesignPresetHtml("corner-card", {
      heading: "",
      subtitle: "",
      tertiary: "",
      title: "",
    });

    expect(html).toContain("Announcement Title");
    expect(html).toContain("Heading");
    expect(html).toContain("Subtitle");
    expect(html).toContain("Additional details");
  });
});
