import { describe, expect, it } from "vitest";

import { filterHymns } from "~/lib/hymn-filters";
import type { HymnRecord } from "~/lib/order-service-types";

const hymn = (overrides: Partial<HymnRecord> = {}): HymnRecord => ({
  hymnNumber: "100",
  id: "hymn-1",
  lastPlayed: "2026-01-15",
  lyricsMarkdown: "",
  musicKey: "C",
  name: "Amazing Grace",
  sourceId: "source-1",
  sourceName: "Trinity Hymnal",
  timesPlayedLastSixMonths: 2,
  ...overrides,
});

describe("filterHymns", () => {
  const hymns = [
    hymn(),
    hymn({
      hymnNumber: "200",
      id: "hymn-2",
      lastPlayed: "",
      musicKey: "G",
      name: "Great Is Thy Faithfulness",
      timesPlayedLastSixMonths: 0,
    }),
    hymn({
      hymnNumber: "300",
      id: "hymn-3",
      lastPlayed: "2025-06-01",
      musicKey: "D",
      name: "Holy Holy Holy",
      sourceName: "Psalter Hymnal",
      timesPlayedLastSixMonths: 5,
    }),
  ];

  it("returns all hymns when no filters are provided", () => {
    expect(filterHymns(hymns, {})).toEqual(hymns);
  });

  it("filters by search term on number and name", () => {
    expect(filterHymns(hymns, { search: "grace" })).toEqual([hymns[0]]);
    expect(filterHymns(hymns, { search: "200" })).toEqual([hymns[1]]);
  });

  it("filters by source, key, and hymn number", () => {
    expect(filterHymns(hymns, { sourceName: "Psalter Hymnal" })).toEqual([
      hymns[2],
    ]);
    expect(filterHymns(hymns, { musicKey: "G" })).toEqual([hymns[1]]);
    expect(filterHymns(hymns, { hymnNumber: "100" })).toEqual([hymns[0]]);
  });

  it("filters by exact and range play counts", () => {
    expect(filterHymns(hymns, { timesPlayedLastSixMonths: 0 })).toEqual([
      hymns[1],
    ]);
    expect(filterHymns(hymns, { maxTimesPlayedLastSixMonths: 2 })).toEqual([
      hymns[0],
      hymns[1],
    ]);
    expect(filterHymns(hymns, { minTimesPlayedLastSixMonths: 3 })).toEqual([
      hymns[2],
    ]);
  });

  it("filters by last played date range", () => {
    expect(
      filterHymns(hymns, {
        lastPlayedFrom: "2026-01-01",
        lastPlayedTo: "2026-12-31",
      })
    ).toEqual([hymns[0]]);
  });

  it("returns only never-played hymns", () => {
    expect(filterHymns(hymns, { neverPlayed: true })).toEqual([hymns[1]]);
  });
});
