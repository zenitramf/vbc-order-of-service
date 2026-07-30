/**
 * Hand-authored style packs for announcement overlays.
 *
 * Packs set typography, scrim, color, and shadow only — never Body photo paints.
 * Apply bakes styles into draft HTML/CSS via role-tagged components.
 */

export const ANNOUNCEMENT_ROLE_ATTR = "data-ann-role";

export type AnnouncementStyleRole =
  | "heading"
  | "title"
  | "subtitle"
  | "body"
  | "link"
  | "scrim-bottom"
  | "scrim-top"
  | "scrim-left"
  | "scrim-right"
  | "panel";

/** Typography / paint tokens for a role. Layout (position, size) is out of scope. */
export interface StyleRoleTokens {
  background?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: string;
  fontWeight?: string;
  letterSpacing?: string;
  lineHeight?: string;
  opacity?: string;
  textShadow?: string;
  textTransform?: string;
}

export interface StylePackPreview {
  accent: string;
  scrimHint: string;
  text: string;
}

export interface AnnouncementStylePack {
  description: string;
  id: string;
  name: string;
  preview: StylePackPreview;
  roles: Partial<Record<AnnouncementStyleRole, StyleRoleTokens>>;
}

/** Thin component surface used by apply helpers (GrapesJS-compatible). */
export interface StyleableComponent {
  addStyle: (style: Record<string, string>) => void;
  getAttributes?: () => Record<string, unknown>;
  getStyle?: () => Record<string, string | undefined>;
  is?: (type: string) => boolean;
}

export interface StylePackApplyTarget {
  /** True when this is the GrapesJS Body / #wrapper (never restyle photo). */
  isWrapper?: (component: StyleableComponent) => boolean;
  /**
   * Find components matching a CSS-like selector.
   * GrapesJS: `wrapper.find('[data-ann-role="title"]')`.
   */
  findByRole: (role: AnnouncementStyleRole) => StyleableComponent[];
}

export interface StylePackApplyResult {
  matchedRoles: AnnouncementStyleRole[];
  updatedCount: number;
}

const ROLE_ATTR = ANNOUNCEMENT_ROLE_ATTR;

/** CSS property map from camelCase token fields. */
export const styleTokensToCss = (
  tokens: StyleRoleTokens
): Record<string, string> => {
  const css: Record<string, string> = {};

  if (tokens.background !== undefined) {
    css.background = tokens.background;
    css["background-color"] = "transparent";
  }
  if (tokens.color !== undefined) {
    css.color = tokens.color;
  }
  if (tokens.fontFamily !== undefined) {
    css["font-family"] = tokens.fontFamily;
  }
  if (tokens.fontSize !== undefined) {
    css["font-size"] = tokens.fontSize;
  }
  if (tokens.fontWeight !== undefined) {
    css["font-weight"] = tokens.fontWeight;
  }
  if (tokens.letterSpacing !== undefined) {
    css["letter-spacing"] = tokens.letterSpacing;
  }
  if (tokens.lineHeight !== undefined) {
    css["line-height"] = tokens.lineHeight;
  }
  if (tokens.opacity !== undefined) {
    css.opacity = tokens.opacity;
  }
  if (tokens.textShadow !== undefined) {
    css["text-shadow"] = tokens.textShadow;
  }
  if (tokens.textTransform !== undefined) {
    css["text-transform"] = tokens.textTransform;
  }

  return css;
};

const hasUrlBackground = (component: StyleableComponent): boolean => {
  const style = component.getStyle?.() ?? {};
  const values = [
    style.background ?? "",
    style["background-image"] ?? "",
    style["background-color"] ?? "",
  ];

  return values.some((value) => /url\s*\(/iu.test(value));
};

/**
 * Apply a style pack to role-tagged components.
 * Skips the wrapper and any component with a url(...) background paint.
 */
export const applyStylePackToTarget = (
  pack: AnnouncementStylePack,
  target: StylePackApplyTarget
): StylePackApplyResult => {
  const matchedRoles: AnnouncementStyleRole[] = [];
  let updatedCount = 0;

  for (const [role, tokens] of Object.entries(pack.roles) as [
    AnnouncementStyleRole,
    StyleRoleTokens,
  ][]) {
    if (!tokens) {
      continue;
    }

    const components = target.findByRole(role);

    if (components.length === 0) {
      continue;
    }

    const css = styleTokensToCss(tokens);
    let roleMatched = false;

    for (const component of components) {
      if (target.isWrapper?.(component)) {
        continue;
      }

      if (hasUrlBackground(component)) {
        continue;
      }

      component.addStyle(css);
      updatedCount += 1;
      roleMatched = true;
    }

    if (roleMatched) {
      matchedRoles.push(role);
    }
  }

  return { matchedRoles, updatedCount };
};

/** Selector for a role attribute (for GrapesJS find / querySelector). */
export const roleSelector = (role: AnnouncementStyleRole): string =>
  `[${ROLE_ATTR}="${role}"]`;

// ── Seed library ────────────────────────────────────────────────────────────

const SYSTEM_SANS = "system-ui, sans-serif";
const GEORGIA_SERIF = "Georgia, 'Times New Roman', serif";

const STYLE_PACKS: AnnouncementStylePack[] = [
  {
    description:
      "Warm church classic: serif title, caps heading, bottom scrim — closest to the default overlay.",
    id: "classic-warm",
    name: "Classic Warm",
    preview: {
      accent: "#fbbf24",
      scrimHint: "rgba(0,0,0,0.65)",
      text: "#ffffff",
    },
    roles: {
      body: {
        color: "#ffffff",
        fontFamily: SYSTEM_SANS,
        fontSize: "28px",
        lineHeight: "1.4",
        opacity: "0.88",
      },
      heading: {
        color: "#ffffff",
        fontFamily: SYSTEM_SANS,
        fontSize: "28px",
        letterSpacing: "0.28em",
        opacity: "0.92",
        textShadow: "0 2px 12px rgba(0,0,0,0.45)",
        textTransform: "uppercase",
      },
      link: {
        color: "#fbbf24",
        fontSize: "28px",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.48) 0%, rgba(0,0,0,0.28) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.22) 42%, transparent 78%)",
      },
      subtitle: {
        color: "#ffffff",
        fontFamily: GEORGIA_SERIF,
        fontSize: "42px",
        fontWeight: "400",
        lineHeight: "1.25",
        opacity: "0.95",
      },
      title: {
        color: "#ffffff",
        fontFamily: GEORGIA_SERIF,
        fontSize: "96px",
        fontWeight: "700",
        lineHeight: "1.05",
        textShadow: "0 4px 24px rgba(0,0,0,0.45)",
      },
    },
  },
  {
    description:
      "Clean modern sans throughout, tighter tracking, lighter scrim for airy photos.",
    id: "modern-clean",
    name: "Modern Clean",
    preview: {
      accent: "#a5b4fc",
      scrimHint: "rgba(0,0,0,0.45)",
      text: "#f8fafc",
    },
    roles: {
      body: {
        color: "#e2e8f0",
        fontFamily: SYSTEM_SANS,
        fontSize: "26px",
        fontWeight: "400",
        lineHeight: "1.45",
        opacity: "0.9",
      },
      heading: {
        color: "#a5b4fc",
        fontFamily: SYSTEM_SANS,
        fontSize: "22px",
        fontWeight: "600",
        letterSpacing: "0.18em",
        opacity: "1",
        textShadow: "0 1px 8px rgba(0,0,0,0.35)",
        textTransform: "uppercase",
      },
      link: {
        color: "#a5b4fc",
        fontSize: "26px",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(15,23,42,0.42) 0%, rgba(15,23,42,0.22) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.14) 48%, transparent 82%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.14) 48%, transparent 82%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.14) 48%, transparent 82%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.14) 48%, transparent 82%)",
      },
      subtitle: {
        color: "#f1f5f9",
        fontFamily: SYSTEM_SANS,
        fontSize: "36px",
        fontWeight: "400",
        lineHeight: "1.3",
        opacity: "0.92",
      },
      title: {
        color: "#f8fafc",
        fontFamily: SYSTEM_SANS,
        fontSize: "84px",
        fontWeight: "700",
        letterSpacing: "-0.02em",
        lineHeight: "1.02",
        textShadow: "0 2px 16px rgba(0,0,0,0.4)",
      },
    },
  },
  {
    description:
      "Strong shadows and deeper scrims for busy or bright background photos.",
    id: "high-contrast",
    name: "High Contrast",
    preview: {
      accent: "#fde68a",
      scrimHint: "rgba(0,0,0,0.82)",
      text: "#ffffff",
    },
    roles: {
      body: {
        color: "#ffffff",
        fontFamily: SYSTEM_SANS,
        fontSize: "28px",
        fontWeight: "500",
        lineHeight: "1.4",
        opacity: "0.95",
        textShadow: "0 2px 10px rgba(0,0,0,0.75)",
      },
      heading: {
        color: "#fde68a",
        fontFamily: SYSTEM_SANS,
        fontSize: "26px",
        fontWeight: "700",
        letterSpacing: "0.32em",
        opacity: "1",
        textShadow: "0 2px 14px rgba(0,0,0,0.8)",
        textTransform: "uppercase",
      },
      link: {
        color: "#fde68a",
        fontSize: "28px",
        textShadow: "0 2px 8px rgba(0,0,0,0.7)",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.48) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 38%, transparent 72%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 38%, transparent 72%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 38%, transparent 72%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.4) 38%, transparent 72%)",
      },
      subtitle: {
        color: "#ffffff",
        fontFamily: GEORGIA_SERIF,
        fontSize: "40px",
        fontWeight: "600",
        lineHeight: "1.2",
        opacity: "1",
        textShadow: "0 3px 16px rgba(0,0,0,0.75)",
      },
      title: {
        color: "#ffffff",
        fontFamily: GEORGIA_SERIF,
        fontSize: "96px",
        fontWeight: "700",
        lineHeight: "1.02",
        textShadow: "0 6px 28px rgba(0,0,0,0.85)",
      },
    },
  },
  {
    description:
      "Lighter weights, soft shadows, and gentle scrims for a quieter editorial feel.",
    id: "soft-editorial",
    name: "Soft Editorial",
    preview: {
      accent: "#e7e5e4",
      scrimHint: "rgba(28,25,23,0.4)",
      text: "#fafaf9",
    },
    roles: {
      body: {
        color: "#e7e5e4",
        fontFamily: GEORGIA_SERIF,
        fontSize: "26px",
        fontWeight: "400",
        lineHeight: "1.5",
        opacity: "0.88",
      },
      heading: {
        color: "#d6d3d1",
        fontFamily: SYSTEM_SANS,
        fontSize: "20px",
        fontWeight: "500",
        letterSpacing: "0.22em",
        opacity: "0.9",
        textShadow: "0 1px 6px rgba(0,0,0,0.3)",
        textTransform: "uppercase",
      },
      link: {
        color: "#d6d3d1",
        fontSize: "26px",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(28,25,23,0.38) 0%, rgba(28,25,23,0.2) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(28,25,23,0.5) 0%, rgba(28,25,23,0.16) 50%, transparent 85%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(28,25,23,0.5) 0%, rgba(28,25,23,0.16) 50%, transparent 85%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(28,25,23,0.5) 0%, rgba(28,25,23,0.16) 50%, transparent 85%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(28,25,23,0.5) 0%, rgba(28,25,23,0.16) 50%, transparent 85%)",
      },
      subtitle: {
        color: "#f5f5f4",
        fontFamily: GEORGIA_SERIF,
        fontSize: "38px",
        fontWeight: "400",
        lineHeight: "1.35",
        opacity: "0.92",
      },
      title: {
        color: "#fafaf9",
        fontFamily: GEORGIA_SERIF,
        fontSize: "88px",
        fontWeight: "500",
        lineHeight: "1.08",
        textShadow: "0 2px 18px rgba(0,0,0,0.35)",
      },
    },
  },
  {
    description:
      "Warm ivory text with gold heading/link accents over a deep amber-tinted scrim.",
    id: "accent-gold",
    name: "Accent Gold",
    preview: {
      accent: "#fbbf24",
      scrimHint: "rgba(20,12,0,0.7)",
      text: "#fffbeb",
    },
    roles: {
      body: {
        color: "#fef3c7",
        fontFamily: SYSTEM_SANS,
        fontSize: "28px",
        lineHeight: "1.4",
        opacity: "0.9",
      },
      heading: {
        color: "#fbbf24",
        fontFamily: SYSTEM_SANS,
        fontSize: "26px",
        fontWeight: "600",
        letterSpacing: "0.3em",
        opacity: "1",
        textShadow: "0 2px 12px rgba(0,0,0,0.5)",
        textTransform: "uppercase",
      },
      link: {
        color: "#fbbf24",
        fontSize: "28px",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(41,25,0,0.55) 0%, rgba(41,25,0,0.32) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(20,12,0,0.72) 0%, rgba(20,12,0,0.28) 42%, transparent 78%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(20,12,0,0.72) 0%, rgba(20,12,0,0.28) 42%, transparent 78%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(20,12,0,0.72) 0%, rgba(20,12,0,0.28) 42%, transparent 78%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(20,12,0,0.72) 0%, rgba(20,12,0,0.28) 42%, transparent 78%)",
      },
      subtitle: {
        color: "#fde68a",
        fontFamily: GEORGIA_SERIF,
        fontSize: "40px",
        fontWeight: "400",
        lineHeight: "1.25",
        opacity: "0.95",
      },
      title: {
        color: "#fffbeb",
        fontFamily: GEORGIA_SERIF,
        fontSize: "96px",
        fontWeight: "700",
        lineHeight: "1.05",
        textShadow: "0 4px 22px rgba(0,0,0,0.5)",
      },
    },
  },
  {
    description:
      "Cool blue-gray text and cooler dark scrims for evening or winter moods.",
    id: "cool-night",
    name: "Cool Night",
    preview: {
      accent: "#7dd3fc",
      scrimHint: "rgba(2,6,23,0.75)",
      text: "#e0f2fe",
    },
    roles: {
      body: {
        color: "#bae6fd",
        fontFamily: SYSTEM_SANS,
        fontSize: "28px",
        lineHeight: "1.4",
        opacity: "0.9",
      },
      heading: {
        color: "#7dd3fc",
        fontFamily: SYSTEM_SANS,
        fontSize: "24px",
        fontWeight: "600",
        letterSpacing: "0.26em",
        opacity: "1",
        textShadow: "0 2px 12px rgba(2,6,23,0.6)",
        textTransform: "uppercase",
      },
      link: {
        color: "#7dd3fc",
        fontSize: "28px",
      },
      panel: {
        background:
          "linear-gradient(180deg, rgba(2,6,23,0.55) 0%, rgba(2,6,23,0.32) 100%)",
      },
      "scrim-bottom": {
        background:
          "linear-gradient(to top, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.3) 42%, transparent 78%)",
      },
      "scrim-left": {
        background:
          "linear-gradient(to right, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.3) 42%, transparent 78%)",
      },
      "scrim-right": {
        background:
          "linear-gradient(to left, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.3) 42%, transparent 78%)",
      },
      "scrim-top": {
        background:
          "linear-gradient(to bottom, rgba(2,6,23,0.78) 0%, rgba(2,6,23,0.3) 42%, transparent 78%)",
      },
      subtitle: {
        color: "#e0f2fe",
        fontFamily: SYSTEM_SANS,
        fontSize: "40px",
        fontWeight: "400",
        lineHeight: "1.25",
        opacity: "0.95",
      },
      title: {
        color: "#f0f9ff",
        fontFamily: SYSTEM_SANS,
        fontSize: "90px",
        fontWeight: "700",
        letterSpacing: "-0.015em",
        lineHeight: "1.04",
        textShadow: "0 4px 24px rgba(2,6,23,0.65)",
      },
    },
  },
];

export const listStylePacks = (): AnnouncementStylePack[] => [...STYLE_PACKS];

export const getStylePack = (id: string): AnnouncementStylePack | null =>
  STYLE_PACKS.find((pack) => pack.id === id) ?? null;
