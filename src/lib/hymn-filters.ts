import type { HymnRecord } from "~/lib/order-service-types";

export interface HymnListFilters {
  hymnNumber?: string;
  lastPlayedFrom?: string;
  lastPlayedTo?: string;
  maxTimesPlayedLastSixMonths?: number;
  minTimesPlayedLastSixMonths?: number;
  musicKey?: string;
  neverPlayed?: boolean;
  search?: string;
  sourceName?: string;
  timesPlayedLastSixMonths?: number;
}

const parseFilterDate = (value: string): number | null => {
  const time = Date.parse(value);

  return Number.isNaN(time) ? null : time;
};

const matchesSearch = (hymn: HymnRecord, search: string | undefined) => {
  const normalizedSearch = search?.trim().toLowerCase();

  if (!normalizedSearch) {
    return true;
  }

  return `${hymn.hymnNumber} ${hymn.name}`
    .toLowerCase()
    .includes(normalizedSearch);
};

const matchesExactField = (value: string, filterValue: string | undefined) =>
  !filterValue || value === filterValue;

const matchesPlayCount = (hymn: HymnRecord, filters: HymnListFilters) => {
  if (
    filters.timesPlayedLastSixMonths !== undefined &&
    hymn.timesPlayedLastSixMonths !== filters.timesPlayedLastSixMonths
  ) {
    return false;
  }

  if (
    filters.minTimesPlayedLastSixMonths !== undefined &&
    hymn.timesPlayedLastSixMonths < filters.minTimesPlayedLastSixMonths
  ) {
    return false;
  }

  if (
    filters.maxTimesPlayedLastSixMonths !== undefined &&
    hymn.timesPlayedLastSixMonths > filters.maxTimesPlayedLastSixMonths
  ) {
    return false;
  }

  return true;
};

const matchesLastPlayed = (
  hymn: HymnRecord,
  filters: HymnListFilters,
  fromTime: number | null,
  toTime: number | null
) => {
  if (filters.neverPlayed) {
    return hymn.lastPlayed.trim() === "";
  }

  const lastPlayedTime = Date.parse(hymn.lastPlayed);

  if (
    fromTime !== null &&
    (Number.isNaN(lastPlayedTime) || lastPlayedTime < fromTime)
  ) {
    return false;
  }

  if (
    toTime !== null &&
    (Number.isNaN(lastPlayedTime) || lastPlayedTime > toTime)
  ) {
    return false;
  }

  return true;
};

export const filterHymns = (
  hymns: HymnRecord[],
  filters: HymnListFilters
): HymnRecord[] => {
  const fromTime = filters.lastPlayedFrom
    ? parseFilterDate(filters.lastPlayedFrom)
    : null;
  const toTime = filters.lastPlayedTo
    ? parseFilterDate(filters.lastPlayedTo)
    : null;

  return hymns.filter(
    (hymn) =>
      matchesSearch(hymn, filters.search) &&
      matchesExactField(hymn.sourceName, filters.sourceName) &&
      matchesExactField(hymn.musicKey, filters.musicKey) &&
      matchesExactField(hymn.hymnNumber, filters.hymnNumber) &&
      matchesPlayCount(hymn, filters) &&
      matchesLastPlayed(hymn, filters, fromTime, toTime)
  );
};
