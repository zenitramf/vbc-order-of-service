import { describe, expect, it } from "vitest";

import {
  buildHymnOption,
  hymnOptionLabel,
  hymnSourceDeleteError,
  hymnSourceIdForName,
  mergeHymnOptions,
  validateHymnSourceName,
} from "~/lib/hymn-sources";
import type { HymnOption, ReferenceOption } from "~/lib/order-service-types";

const sources: ReferenceOption[] = [
  { id: "living-hymns", name: "Living Hymns" },
  { id: "soul-stirring-songs-hymns", name: "Soul Stirring Songs & Hymns" },
];

describe("validateHymnSourceName", () => {
  it("rejects an empty name", () => {
    expect(validateHymnSourceName("  ", sources)).toBe(
      "Source tag name is required."
    );
  });

  it("rejects a duplicate name case-insensitively", () => {
    expect(validateHymnSourceName("living hymns", sources)).toBe(
      "A source tag named “Living Hymns” already exists."
    );
  });

  it("allows keeping the same name when renaming that same source", () => {
    expect(
      validateHymnSourceName("Living Hymns", sources, "living-hymns")
    ).toBe(null);
  });

  it("allows a new unique name", () => {
    expect(validateHymnSourceName("Trinity Hymnal", sources)).toBe(null);
  });
});

describe("hymnSourceIdForName", () => {
  it("slugifies the name", () => {
    expect(hymnSourceIdForName("Soul Stirring Songs & Hymns!", [])).toBe(
      "soul-stirring-songs-hymns"
    );
  });

  it("dedupes against existing ids with a numeric suffix", () => {
    expect(hymnSourceIdForName("Living Hymns", sources)).toBe("living-hymns-2");
  });

  it("falls back when the name has no slug-safe characters", () => {
    expect(hymnSourceIdForName("¡Canta!", sources)).toBe("canta");
    expect(hymnSourceIdForName("★★★", sources)).toBe("source");
  });
});

describe("hymnSourceDeleteError", () => {
  it("blocks deleting a source that hymns still use", () => {
    expect(hymnSourceDeleteError("Living Hymns", 3)).toBe(
      "“Living Hymns” is used by 3 hymns. Move those hymns to another source tag first."
    );
    expect(hymnSourceDeleteError("Living Hymns", 1)).toBe(
      "“Living Hymns” is used by 1 hymn. Move that hymn to another source tag first."
    );
  });

  it("allows deleting an unused source", () => {
    expect(hymnSourceDeleteError("Living Hymns", 0)).toBe(null);
  });
});

describe("hymn option helpers", () => {
  it("labels options like the server hymn options", () => {
    expect(hymnOptionLabel("42", "Amazing Grace")).toBe("42 — Amazing Grace");
    expect(hymnOptionLabel("", "Amazing Grace")).toBe("Amazing Grace");
  });

  it("builds an option for a newly created hymn", () => {
    expect(
      buildHymnOption({
        hymnNumber: "42",
        id: "hymn-1",
        lyricsMarkdown: "Verse 1",
        musicKey: "#",
        name: "Amazing Grace",
        sourceName: "Living Hymns",
      })
    ).toEqual({
      hasLyrics: true,
      id: "hymn-1",
      label: "42 — Amazing Grace",
      lastPlayed: "",
      musicKey: "#",
      sourceName: "Living Hymns",
    });
  });

  it("merges created hymns over base options by id", () => {
    const base: HymnOption[] = [
      {
        hasLyrics: false,
        id: "hymn-1",
        label: "Old",
        lastPlayed: "",
        musicKey: "",
        sourceName: "Living Hymns",
      },
    ];
    const created: HymnOption[] = [
      { ...base[0], label: "Renamed" },
      {
        hasLyrics: true,
        id: "hymn-2",
        label: "New",
        lastPlayed: "",
        musicKey: "",
        sourceName: "Trinity Hymnal",
      },
    ];

    expect(mergeHymnOptions(base, created).map((hymn) => hymn.label)).toEqual([
      "Renamed",
      "New",
    ]);
  });
});
