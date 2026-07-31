import { describe, expect, it } from "vitest";

import {
  ANNOUNCEMENT_BLOCK_IDS,
  getAnnouncementBlockDef,
  isAnnouncementBlockId,
  listAnnouncementBlockTemplates,
} from "~/lib/announcement-block-templates";
import { ANNOUNCEMENT_ROLE_ATTR } from "~/lib/announcement-style-library";

describe("announcement block templates", () => {
  it("lists all registered block ids", () => {
    expect(ANNOUNCEMENT_BLOCK_IDS.length).toBeGreaterThan(5);
    expect(isAnnouncementBlockId("ann-title")).toBe(true);
    expect(isAnnouncementBlockId("ann-missing")).toBe(false);
  });

  it("exposes content defs with expected roles for text blocks", () => {
    for (const id of [
      "ann-heading",
      "ann-title",
      "ann-subtitle",
      "ann-body",
    ] as const) {
      const def = getAnnouncementBlockDef(id);
      expect(def.attributes?.[ANNOUNCEMENT_ROLE_ATTR]).toBeTruthy();
      expect(def.type).toBe("text");
    }
  });

  it("merges content and style overrides", () => {
    const def = getAnnouncementBlockDef("ann-title", {
      content: "Easter Service",
      style: { color: "#fbbf24" },
    });

    expect(def.content).toBe("Easter Service");
    expect(def.style?.color).toBe("#fbbf24");
    expect(def.style?.["font-size"]).toBe("132px");
  });

  it("matches listAnnouncementBlockTemplates length to ids", () => {
    expect(listAnnouncementBlockTemplates()).toHaveLength(
      ANNOUNCEMENT_BLOCK_IDS.length
    );
  });
});
