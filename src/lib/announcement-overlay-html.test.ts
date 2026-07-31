import { describe, expect, it } from "vitest";

import {
  BOTTOM_SCRIM_GRADIENT,
  LEFT_SCRIM_GRADIENT,
  PANEL_SCRIM_GRADIENT,
  RIGHT_SCRIM_GRADIENT,
  TOP_SCRIM_GRADIENT,
  buildOverlayHtml,
  coerceBackgroundToAlphaGradient,
  flattenStageMediaQueries,
  isUsableProjectData,
  normalizeBackgroundDeclarations,
  normalizeOverlayComponentsHtml,
  parseOverlayHtml,
  prepareOverlayHtmlForRender,
  projectDataKey,
  sanitizeProjectData,
  solidColorToAlphaGradient,
  stripAnnouncementBackgroundHtml,
  stripRuntimePhotoBackgroundCss,
} from "~/lib/announcement-overlay-html";
import type { GrapesProjectData } from "~/lib/announcement-types";

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

  it("preserves GrapesJS auto-ids so #id CSS rules still match on export", () => {
    // GrapesJS styles live as ID selectors when avoidInlineStyle is on.
    // Stripping those IDs from markup is what produced unstyled JPG exports.
    const components = `<div id="iabc12"><h1 id="ixy99">Faith Bible Institute</h1></div>`;
    const css = `#iabc12{position:absolute;bottom:0;left:0;right:0;padding:80px}
#ixy99{color:#f5e6c8;font-size:96px;font-weight:700}`;

    const html = buildOverlayHtml(components, css);
    expect(html).toContain('id="iabc12"');
    expect(html).toContain('id="ixy99"');
    expect(html).toContain("#iabc12{");
    expect(html).toContain("#ixy99{");
    expect(html).toContain("color:#f5e6c8");

    const parsed = parseOverlayHtml(html);
    expect(parsed.components).toContain('id="iabc12"');
    expect(parsed.components).toContain('id="ixy99"');
    expect(parsed.css).toContain("#ixy99");
    expect(parsed.css).toContain("96px");
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

describe("stripRuntimePhotoBackgroundCss", () => {
  it("removes remote background-image urls from css", () => {
    const css = `
#wrapper { background-image: url("https://cdn.example/a.jpg"); width: 1920px; }
.scrim { background: linear-gradient(to top, rgba(0,0,0,0.5), transparent); }
`;
    const stripped = stripRuntimePhotoBackgroundCss(css);
    expect(stripped).not.toContain("cdn.example");
    expect(stripped).not.toContain("background-image");
    expect(stripped).toContain("linear-gradient");
    expect(stripped).toContain("1920px");
  });
});

describe("flattenStageMediaQueries", () => {
  it("unwraps max-width:1920px device rules so export is viewport-independent", () => {
    const css = `
.base{color:white}
@media (max-width: 1920px){
#iabc{color:#f5e6c8;font-size:96px}
#ixyz{position:absolute;bottom:0}
}
.tail{opacity:1}
`;
    const flat = flattenStageMediaQueries(css);
    expect(flat).not.toContain("@media");
    expect(flat).toContain("#iabc{color:#f5e6c8;font-size:96px}");
    expect(flat).toContain("#ixyz{position:absolute;bottom:0}");
    expect(flat).toContain(".base{color:white}");
    expect(flat).toContain(".tail{opacity:1}");
  });

  it("keeps smaller max-width queries intact", () => {
    const css = `@media (max-width: 768px){.m{display:none}}`;
    expect(flattenStageMediaQueries(css)).toContain("@media");
    expect(flattenStageMediaQueries(css)).toContain(".m{display:none}");
  });
});

describe("normalizeOverlayComponentsHtml", () => {
  it("converts body wrappers to divs so IDs survive innerHTML", () => {
    const raw = `<body id="i8fm"><div id="child">Hi</div></body>`;
    const normalized = normalizeOverlayComponentsHtml(raw);
    expect(normalized).toContain('<div id="i8fm">');
    expect(normalized).toContain("</div>");
    expect(normalized).not.toContain("<body");
    expect(normalized).not.toContain("</body>");
    expect(normalized).toContain('id="child"');
  });
});

describe("prepareOverlayHtmlForRender", () => {
  it("repairs media-scoped GrapesJS drafts for export", () => {
    const raw = `<div class="announcement-overlay" style="width:1920px">
<style>
@media (max-width: 1920px){#i1{color:#f5e6c8;font-size:72px}}
</style>
<body id="wrap"><div id="i1">Title</div></body>
</div>`;
    const prepared = prepareOverlayHtmlForRender(raw);
    expect(prepared).not.toContain("@media");
    expect(prepared).toContain("#i1{");
    expect(prepared).toContain("color:#f5e6c8");
    expect(prepared).not.toContain("<body");
    expect(prepared).toContain('id="i1"');
    expect(prepared).toContain("Title");
  });
});

describe("background coercion", () => {
  it("passes gradients through unchanged", () => {
    expect(coerceBackgroundToAlphaGradient(BOTTOM_SCRIM_GRADIENT)).toBe(
      BOTTOM_SCRIM_GRADIENT
    );
    expect(coerceBackgroundToAlphaGradient(TOP_SCRIM_GRADIENT)).toBe(
      TOP_SCRIM_GRADIENT
    );
    expect(coerceBackgroundToAlphaGradient(LEFT_SCRIM_GRADIENT)).toBe(
      LEFT_SCRIM_GRADIENT
    );
    expect(coerceBackgroundToAlphaGradient(RIGHT_SCRIM_GRADIENT)).toBe(
      RIGHT_SCRIM_GRADIENT
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

describe("GrapesJS project JSON helpers", () => {
  it("detects usable project payloads", () => {
    expect(isUsableProjectData(null)).toBe(false);
    expect(isUsableProjectData({})).toBe(false);
    expect(
      isUsableProjectData({
        pages: [{ component: { components: [], type: "wrapper" } }],
        styles: [],
      })
    ).toBe(true);
    expect(isUsableProjectData({ pages: [], styles: [] })).toBe(true);
  });

  it("strips runtime photo background-image from styles and components", () => {
    const project = {
      pages: [
        {
          frames: [
            {
              component: {
                components: [
                  {
                    attributes: { "data-announcement-bg": "1" },
                    type: "image",
                  },
                  {
                    content: "Title",
                    style: {
                      color: "#fff",
                    },
                    type: "text",
                  },
                ],
                style: {
                  "background-image":
                    'url("https://example.com/variation.jpg")',
                  height: "1080px",
                  width: "1920px",
                },
                type: "wrapper",
              },
            },
          ],
        },
      ],
      styles: [
        {
          selectors: ["#iabc"],
          style: {
            "background-image": "url(data:image/png;base64,abc)",
            color: "red",
          },
        },
        {
          selectors: ["#ixy"],
          style: {
            background: PANEL_SCRIM_GRADIENT,
          },
        },
      ],
    } as GrapesProjectData;

    const sanitized = sanitizeProjectData(project);
    expect(sanitized).not.toBeNull();
    expect(JSON.stringify(sanitized)).not.toContain("example.com");
    expect(JSON.stringify(sanitized)).not.toContain("data:image");
    expect(JSON.stringify(sanitized)).not.toContain("data-announcement-bg");
    expect(JSON.stringify(sanitized)).toContain(PANEL_SCRIM_GRADIENT);
    expect(JSON.stringify(sanitized)).toContain("Title");
    expect(JSON.stringify(sanitized)).toContain("height");
  });

  it("returns stable keys for equal project snapshots", () => {
    const a = { pages: [{ id: "1" }], styles: [] } as GrapesProjectData;
    const b = { pages: [{ id: "1" }], styles: [] } as GrapesProjectData;
    expect(projectDataKey(a)).toBe(projectDataKey(b));
    expect(projectDataKey(null)).toBe("");
  });
});
