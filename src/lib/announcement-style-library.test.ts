import { describe, expect, it, vi } from "vitest";

import {
  ANNOUNCEMENT_ROLE_ATTR,
  applyStylePackToTarget,
  getStylePack,
  listStylePacks,
  roleSelector,
  styleTokensToCss,
} from "./announcement-style-library";
import type {
  AnnouncementStyleRole,
  StyleableComponent,
} from "./announcement-style-library";

describe("announcement-style-library", () => {
  it("exposes a reusable seed library with unique ids", () => {
    const packs = listStylePacks();
    expect(packs.length).toBeGreaterThanOrEqual(4);

    const ids = packs.map((pack) => pack.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const pack of packs) {
      expect(pack.name.trim().length).toBeGreaterThan(0);
      expect(pack.description.trim().length).toBeGreaterThan(0);
      expect(pack.preview.text).toMatch(/^#/u);
      expect(pack.roles.title).toBeDefined();
      expect(pack.roles.heading).toBeDefined();
    }
  });

  it("resolves packs by id", () => {
    expect(getStylePack("classic-warm")?.name).toBe("Classic Warm");
    expect(getStylePack("missing-pack")).toBeNull();
  });

  it("maps tokens to CSS properties without layout keys", () => {
    const css = styleTokensToCss({
      background:
        "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 80%)",
      color: "#ffffff",
      fontFamily: "Georgia, serif",
      fontSize: "96px",
      fontWeight: "700",
      letterSpacing: "0.02em",
      lineHeight: "1.05",
      opacity: "0.95",
      textShadow: "0 4px 24px rgba(0,0,0,0.45)",
      textTransform: "uppercase",
    });

    expect(css).toEqual({
      background:
        "linear-gradient(to top, rgba(0,0,0,0.65) 0%, transparent 80%)",
      "background-color": "transparent",
      color: "#ffffff",
      "font-family": "Georgia, serif",
      "font-size": "96px",
      "font-weight": "700",
      "letter-spacing": "0.02em",
      "line-height": "1.05",
      opacity: "0.95",
      "text-shadow": "0 4px 24px rgba(0,0,0,0.45)",
      "text-transform": "uppercase",
    });
    expect(css).not.toHaveProperty("width");
    expect(css).not.toHaveProperty("position");
    expect(css).not.toHaveProperty("padding");
  });

  it("builds role selectors", () => {
    expect(roleSelector("title")).toBe(`[${ANNOUNCEMENT_ROLE_ATTR}="title"]`);
  });

  it("applies styles to matching roles and skips the wrapper", () => {
    const titleStyles: Record<string, string>[] = [];
    const wrapperStyles: Record<string, string>[] = [];

    const title: StyleableComponent = {
      addStyle: (style) => {
        titleStyles.push(style);
      },
    };
    const wrapper: StyleableComponent = {
      addStyle: (style) => {
        wrapperStyles.push(style);
      },
      getStyle: () => ({
        "background-image": 'url("https://example.com/a.jpg")',
      }),
    };

    const pack = getStylePack("classic-warm");
    expect(pack).not.toBeNull();
    if (!pack) {
      return;
    }

    const result = applyStylePackToTarget(pack, {
      findByRole: (role) => {
        if (role === "title") {
          return [title, wrapper];
        }
        return [];
      },
      isWrapper: (component) => component === wrapper,
    });

    expect(result.updatedCount).toBe(1);
    expect(result.matchedRoles).toEqual(["title"]);
    expect(titleStyles).toHaveLength(1);
    expect(titleStyles[0]?.color).toBe("#ffffff");
    expect(titleStyles[0]?.["font-family"]).toContain("Georgia");
    expect(wrapperStyles).toHaveLength(0);
  });

  it("skips components with url(...) backgrounds even when not wrapper", () => {
    const addStyle = vi.fn();
    const photoNode: StyleableComponent = {
      addStyle,
      getStyle: () => ({
        background: 'url("https://cdn.example/photo.jpg") center / cover',
      }),
    };

    const pack = getStylePack("high-contrast");
    expect(pack).not.toBeNull();
    if (!pack) {
      return;
    }

    const result = applyStylePackToTarget(pack, {
      findByRole: (role) => (role === "scrim-bottom" ? [photoNode] : []),
    });

    expect(result.updatedCount).toBe(0);
    expect(addStyle).not.toHaveBeenCalled();
  });

  it("never writes background-image url paints when applying packs", () => {
    const applied: Record<string, string>[] = [];
    const component: StyleableComponent = {
      addStyle: (style) => {
        applied.push(style);
      },
      getStyle: () => ({}),
    };

    for (const pack of listStylePacks()) {
      applied.length = 0;
      applyStylePackToTarget(pack, {
        findByRole: (role: AnnouncementStyleRole) => {
          if (pack.roles[role]) {
            return [component];
          }
          return [];
        },
      });

      for (const style of applied) {
        const serialized = JSON.stringify(style);
        expect(serialized).not.toMatch(/url\s*\(/iu);
        if (style.background) {
          expect(style.background).toMatch(/gradient/iu);
          expect(style["background-color"]).toBe("transparent");
        }
      }
    }
  });

  it("reports zero updates when no roles match", () => {
    const pack = getStylePack("modern-clean");
    expect(pack).not.toBeNull();
    if (!pack) {
      return;
    }

    const result = applyStylePackToTarget(pack, {
      findByRole: () => [],
    });

    expect(result).toEqual({ matchedRoles: [], updatedCount: 0 });
  });
});
