/**
 * Pure helpers for material-change detection on announcement drafts.
 * Kept free of Cloudflare / TanStack so unit tests can import them.
 */

import type {
  AnnouncementContent,
  AnnouncementDraft,
  GrapesProjectData,
  SaveAnnouncementInput,
} from "~/lib/announcement-types";

const projectDataFingerprint = (
  projectData: GrapesProjectData | null | undefined
): string => {
  if (!projectData) {
    return "";
  }

  try {
    return JSON.stringify(projectData);
  } catch {
    return "";
  }
};

const normalizeProjectData = (
  value: unknown
): GrapesProjectData | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as GrapesProjectData;
};

const emptyContent = (
  partial?: Partial<AnnouncementContent>
): AnnouncementContent => ({
  heading: partial?.heading?.trim() ?? "",
  subtitle: partial?.subtitle?.trim() ?? "",
  tertiary: partial?.tertiary?.trim() ?? "",
  title: partial?.title?.trim() ?? "",
});

const contentEqual = (
  left: AnnouncementContent,
  right: AnnouncementContent
): boolean =>
  left.title === right.title &&
  left.subtitle === right.subtitle &&
  left.heading === right.heading &&
  left.tertiary === right.tertiary;

/**
 * True when the save payload changes fields that affect the approved artifact.
 * Used so open/hydrate / identical autosaves do not demote approved → draft.
 */
export const isMaterialSave = (
  draft: AnnouncementDraft,
  data: SaveAnnouncementInput
): boolean => {
  if (data.name !== undefined) {
    const name = data.name.trim();
    if (name && name !== draft.name) {
      return true;
    }
  }

  if (data.content !== undefined) {
    const next = emptyContent(data.content);
    if (!contentEqual(next, draft.content)) {
      return true;
    }
  }

  if (
    data.backgroundPrompt !== undefined &&
    data.backgroundPrompt.trim() !== draft.backgroundPrompt
  ) {
    return true;
  }

  if (data.appliedStyleId !== undefined) {
    const next =
      typeof data.appliedStyleId === "string" && data.appliedStyleId.trim()
        ? data.appliedStyleId.trim()
        : null;
    if (next !== draft.appliedStyleId) {
      return true;
    }
  }

  if (data.projectData !== undefined) {
    const next = normalizeProjectData(data.projectData);
    if (
      projectDataFingerprint(next) !== projectDataFingerprint(draft.projectData)
    ) {
      return true;
    }
  }

  return false;
};
