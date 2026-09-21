import { describe, expect, it } from "vitest";

import { isMaterialSave } from "~/lib/announcement-material";
import type {
  AnnouncementDraft,
  SaveAnnouncementInput,
} from "~/lib/announcement-types";

const baseDraft = (): AnnouncementDraft => ({
  appliedStyleId: "classic-bottom",
  approvedAt: "2026-01-01T00:00:00.000Z",
  backgroundPrompt: "soft light",
  content: {
    heading: "H",
    subtitle: "S",
    tertiary: "T",
    title: "Title",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  exportObjectKey: "announcements/a/exports/approved.jpg",
  generationJob: null,
  height: 1080,
  id: "a",
  layoutJob: null,
  legacyHtml: null,
  name: "Sunday",
  overlayHtml: "<div class=\"announcement-overlay\"><h1>Title</h1></div>",
  projectData: null,
  selectedVariationId: "v1",
  showInPresentationDeck: false,
  status: "approved",
  updatedAt: "2026-01-01T00:00:00.000Z",
  variations: [],
  width: 1920,
});

describe("isMaterialSave", () => {
  it("returns false when payload matches stored draft", () => {
    const draft = baseDraft();
    const data: SaveAnnouncementInput = {
      backgroundPrompt: draft.backgroundPrompt,
      content: draft.content,
      id: draft.id,
      name: draft.name,
      overlayHtml: draft.overlayHtml,
    };

    expect(isMaterialSave(draft, data)).toBe(false);
  });

  it("returns true when overlay HTML changes", () => {
    const draft = baseDraft();
    const data: SaveAnnouncementInput = {
      id: draft.id,
      overlayHtml: "<div class=\"announcement-overlay\"><h1>Changed</h1></div>",
    };

    expect(isMaterialSave(draft, data)).toBe(true);
  });

  it("returns true when content title changes", () => {
    const draft = baseDraft();
    const data: SaveAnnouncementInput = {
      content: { ...draft.content, title: "New title" },
      id: draft.id,
    };

    expect(isMaterialSave(draft, data)).toBe(true);
  });

  it("returns false for identical name and content only", () => {
    const draft = baseDraft();
    const data: SaveAnnouncementInput = {
      content: { ...draft.content },
      id: draft.id,
      name: draft.name,
    };

    expect(isMaterialSave(draft, data)).toBe(false);
  });
});
