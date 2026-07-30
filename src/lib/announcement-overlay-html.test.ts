import { describe, expect, it } from "vitest";

import {
  buildOverlayHtml,
  parseOverlayHtml,
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
    expect(parsed.css).toContain(".foo { color: red; }");
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
    expect(html).toContain("<h1>Title</h1>");
    expect(html).not.toContain("<style>");
  });

  it("embeds css in a style tag when provided", () => {
    const html = buildOverlayHtml('<div class="x">Hi</div>', ".x{color:red}");
    expect(html).toContain("<style>");
    expect(html).toContain(".x{color:red}");
    expect(html).toContain('class="x"');
  });
});
