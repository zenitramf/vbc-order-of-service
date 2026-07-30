import { describe, expect, it } from "vitest";

import {
  BOTTOM_SCRIM_GRADIENT,
  PANEL_SCRIM_GRADIENT,
  buildOverlayHtml,
  coerceBackgroundToAlphaGradient,
  normalizeBackgroundDeclarations,
  parseOverlayHtml,
  solidColorToAlphaGradient,
  stripAnnouncementBackgroundHtml,
} from "~/lib/announcement-overlay-html";

describe("parseOverlayHtml", () => {
  it("returns empty parts for blank input", () => {
    expect(parseOverlayHtml("")).toEqual({ components: "", css: "" });
    expect(parseOverlayHtml("   ")).toEqual({ components: "", css: "" });
  });

  it("extracts components from .announcement-overlay roots", () => {
    const raw = `<div class="announcement-overlay" style="width:1920px">
  <h1>Hello</h1>
  <p>World</p>
</div>`;

    const parsed = parseOverlayHtml(raw);
    expect(parsed.css).toBe("");
    expect(parsed.components).toContain("<h1>Hello</h1>");
    expect(parsed.components).toContain("<p>World</p>");
    expect(parsed.components).not.toContain("announcement-overlay");
  });

  it("pulls style tags out of the overlay bundle", () => {
    const raw = `<div class="announcement-overlay">
<style>
.foo { color: red; }
</style>
<div class="foo">Text</div>
</div>`;

    const parsed = parseOverlayHtml(raw);
    expect(parsed.css.replaceAll(/\s+/gu, " ")).toContain(".foo {color:red}");
    expect(parsed.components).toContain('class="foo"');
    expect(parsed.components).not.toContain("<style>");
  });

  it("falls back to full markup when no overlay wrapper exists", () => {
    const raw = `<p style="color:#fff">Loose fragment</p>`;
    const parsed = parseOverlayHtml(raw);
    expect(parsed.components).toContain("Loose fragment");
    expect(parsed.css).toBe("");
  });
});

describe("buildOverlayHtml", () => {
  it("wraps components in a fixed 1920×1080 overlay root", () => {
    const html = buildOverlayHtml("<h1>Title</h1>", "");
    expect(html).toContain('class="announcement-overlay"');
    expect(html).toContain("width:1920px");
    expect(html).toContain("height:1080px");
    expect(html).toContain("background:transparent");
    expect(html).toContain("<h1>Title</h1>");
    expect(html).not.toContain("<style>");
  });

  it("embeds css in a style tag when provided", () => {
    const html = buildOverlayHtml('<div class="x">Hi</div>', ".x{color:red}");
    expect(html).toContain("<style>");
    expect(html).toContain(".x{color:red}");
    expect(html).toContain('class="x"');
  });

  it("converts solid component backgrounds into alpha gradients", () => {
    const html = buildOverlayHtml(
      '<div style="background-color:#000000;color:#fff">Hi</div>',
      ""
    );
    expect(html).toContain("linear-gradient");
    expect(html).toContain("background-color:transparent");
    expect(html).not.toMatch(/background-color\s*:\s*#000000/iu);
  });
});

describe("stripAnnouncementBackgroundHtml", () => {
  it("removes locked background image nodes", () => {
    const raw = `<img data-announcement-bg="1" src="https://example.com/a.jpg" alt="" />
<div class="content">Hello</div>
<div data-announcement-bg="1"><span>nope</span></div>`;

    const stripped = stripAnnouncementBackgroundHtml(raw);
    expect(stripped).not.toContain("data-announcement-bg");
    expect(stripped).not.toContain("example.com");
    expect(stripped).toContain("Hello");
  });

  it("strips background nodes when parsing overlay HTML", () => {
    const raw = `<div class="announcement-overlay">
<img data-announcement-bg="1" src="https://cdn.example/bg.jpg" />
<h1>Title</h1>
</div>`;
    const parsed = parseOverlayHtml(raw);
    expect(parsed.components).toContain("Title");
    expect(parsed.components).not.toContain("data-announcement-bg");
    expect(parsed.components).not.toContain("cdn.example");
  });
});

describe("background coercion", () => {
  it("passes gradients through unchanged", () => {
    expect(coerceBackgroundToAlphaGradient(BOTTOM_SCRIM_GRADIENT)).toBe(
      BOTTOM_SCRIM_GRADIENT
    );
    expect(coerceBackgroundToAlphaGradient(PANEL_SCRIM_GRADIENT)).toBe(
      PANEL_SCRIM_GRADIENT
    );
  });

  it("turns solid colors into alpha gradients", () => {
    const panel = solidColorToAlphaGradient("#000000", "panel");
    expect(panel).toContain("linear-gradient");
    expect(panel).toContain("rgba(0,0,0,");
    expect(panel).toMatch(/rgba\(0,0,0,0\.\d+\)/u);

    const bottom = solidColorToAlphaGradient("#000000", "bottom");
    expect(bottom).toContain("transparent");
  });

  it("rewrites solid background-color declarations", () => {
    const normalized = normalizeBackgroundDeclarations(
      "color:#fff;background-color:black;padding:8px"
    );
    expect(normalized).toContain("linear-gradient");
    expect(normalized).toContain("background-color:transparent");
    expect(normalized).toContain("color:#fff");
    expect(normalized).not.toContain("background-color:black");
  });
});
