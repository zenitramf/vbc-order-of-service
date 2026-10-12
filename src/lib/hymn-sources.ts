import type { HymnOption, ReferenceOption } from "~/lib/order-service-types";

/** Slug form of a source tag name, used as the stable `hymn_sources.id`. */
export const slugifyHymnSourceName = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "");

/**
 * Why a source tag name cannot be saved, or null when it can. Pass the id of
 * the source being renamed as `excludeId` so keeping its own name is allowed.
 */
export const validateHymnSourceName = (
  name: string,
  existing: ReferenceOption[],
  excludeId?: string
): string | null => {
  const trimmed = name.trim();

  if (!trimmed) {
    return "Source tag name is required.";
  }

  const duplicate = existing.find(
    (source) =>
      source.id !== excludeId &&
      source.name.trim().toLowerCase() === trimmed.toLowerCase()
  );

  return duplicate
    ? `A source tag named “${duplicate.name}” already exists.`
    : null;
};

/** A free id for a new source tag: the slugified name, deduped with -2, -3… */
export const hymnSourceIdForName = (
  name: string,
  existing: ReferenceOption[]
): string => {
  const base = slugifyHymnSourceName(name) || "source";
  const usedIds = new Set(existing.map((source) => source.id));

  if (!usedIds.has(base)) {
    return base;
  }

  let suffix = 2;
  while (usedIds.has(`${base}-${suffix}`)) {
    suffix += 1;
  }

  return `${base}-${suffix}`;
};

/** Why a source tag cannot be deleted, or null when it can. */
export const hymnSourceDeleteError = (
  name: string,
  hymnCount: number
): string | null => {
  if (hymnCount <= 0) {
    return null;
  }

  return hymnCount === 1
    ? `“${name}” is used by 1 hymn. Move that hymn to another source tag first.`
    : `“${name}” is used by ${hymnCount} hymns. Move those hymns to another source tag first.`;
};

/** Combobox label for a hymn, matching `getHymnOptions` on the server. */
export const hymnOptionLabel = (hymnNumber: string, name: string): string =>
  [hymnNumber.trim(), name.trim()].filter(Boolean).join(" — ");

export interface NewHymnOptionInput {
  hymnNumber: string;
  id: string;
  lyricsMarkdown?: string;
  musicKey: string;
  name: string;
  sourceName: string;
}

/** The combobox option for a hymn that was just created client-side. */
export const buildHymnOption = (input: NewHymnOptionInput): HymnOption => ({
  hasLyrics: Boolean(input.lyricsMarkdown?.trim()),
  id: input.id,
  label: hymnOptionLabel(input.hymnNumber, input.name),
  lastPlayed: "",
  musicKey: input.musicKey,
  sourceName: input.sourceName,
});

/**
 * Merge locally created hymns over the loader-provided options so a hymn
 * added mid-edit is selectable without a route reload.
 */
export const mergeHymnOptions = (
  base: HymnOption[],
  created: HymnOption[]
): HymnOption[] => {
  if (created.length === 0) {
    return base;
  }

  const createdById = new Map(created.map((hymn) => [hymn.id, hymn]));
  const merged = base.map((hymn) => createdById.get(hymn.id) ?? hymn);
  const baseIds = new Set(base.map((hymn) => hymn.id));

  for (const hymn of created) {
    if (!baseIds.has(hymn.id)) {
      merged.push(hymn);
    }
  }

  return merged;
};
