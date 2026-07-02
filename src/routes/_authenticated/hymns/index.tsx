import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  MusicNotesIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row, SortingState } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { deleteHymn, getHymns } from "~/lib/order-service-data";
import type { HymnRecord } from "~/lib/order-service-types";

interface HymnColumnsOptions {
  hymnToDelete: string | null;
  isDeleting: boolean;
  onDelete: (hymnId: string, hymnName: string) => Promise<void>;
  onOpenChange: (open: boolean, hymnId: string) => void;
}

const ALL_FILTER_VALUE = "all";

const sortDate = (rowA: Row<HymnRecord>, rowB: Row<HymnRecord>) =>
  (Date.parse(rowA.original.lastPlayed) || 0) -
  (Date.parse(rowB.original.lastPlayed) || 0);

const sortHymnNumber = (rowA: Row<HymnRecord>, rowB: Row<HymnRecord>) => {
  const firstNumber = Number.parseInt(rowA.original.hymnNumber, 10);
  const secondNumber = Number.parseInt(rowB.original.hymnNumber, 10);

  if (Number.isNaN(firstNumber) || Number.isNaN(secondNumber)) {
    return rowA.original.hymnNumber.localeCompare(rowB.original.hymnNumber);
  }

  return firstNumber - secondNumber;
};

const toSelectOptions = (values: string[]) => {
  const uniqueValues = [...new Set(values.filter(Boolean))];

  // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include toSorted.
  return uniqueValues.sort((first, second) => first.localeCompare(second));
};

const renderSortIcon = (sortDirection: false | "asc" | "desc") => {
  if (sortDirection === "asc") {
    return <CaretUpIcon data-icon="inline-end" />;
  }

  if (sortDirection === "desc") {
    return <CaretDownIcon data-icon="inline-end" />;
  }

  return <CaretUpDownIcon data-icon="inline-end" />;
};

const createHymnColumns = ({
  hymnToDelete,
  isDeleting,
  onDelete,
  onOpenChange,
}: HymnColumnsOptions): ColumnDef<HymnRecord>[] => [
  {
    accessorKey: "hymnNumber",
    header: "No.",
    sortingFn: sortHymnNumber,
  },
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ hymnId: row.original.id }}
        to="/hymns/$hymnId"
      >
        {row.original.name}
      </Link>
    ),
    header: "Name",
  },
  {
    accessorKey: "sourceName",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.sourceName}</Badge>
    ),
    header: "Source",
  },
  {
    accessorKey: "musicKey",
    header: "Key",
  },
  {
    accessorKey: "lastPlayed",
    cell: ({ row }) => row.original.lastPlayed || "—",
    header: "Last played",
    sortingFn: sortDate,
  },
  {
    accessorKey: "timesPlayedLastSixMonths",
    header: "6 months",
  },
  {
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link params={{ hymnId: row.original.id }} to="/hymns/$hymnId">
            Edit
          </Link>
        </Button>
        <AlertDialog
          onOpenChange={(open) => {
            onOpenChange(open, row.original.id);
          }}
          open={hymnToDelete === row.original.id}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this hymn?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{row.original.name}" from your
                hymn library.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={async () => {
                  await onDelete(row.original.id, row.original.name);
                }}
                variant="destructive"
              >
                {isDeleting ? "Deleting..." : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    ),
    header: "Actions",
    id: "actions",
  },
];

const HymnsPage = () => {
  const hymns = Route.useLoaderData();
  const [hymnRows, setHymnRows] = useState(hymns);
  const router = useRouter();
  const deleteHymnFn = useServerFn(deleteHymn);
  const [hymnToDelete, setHymnToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sourceFilter, setSourceFilter] = useState(ALL_FILTER_VALUE);
  const [keyFilter, setKeyFilter] = useState(ALL_FILTER_VALUE);
  const [sixMonthFilter, setSixMonthFilter] = useState(ALL_FILTER_VALUE);
  const [lastPlayedFrom, setLastPlayedFrom] = useState("");
  const [lastPlayedTo, setLastPlayedTo] = useState("");

  useEffect(() => {
    setHymnRows(hymns);
  }, [hymns]);

  const handleDelete = async (hymnId: string, hymnName: string) => {
    const previousRows = hymnRows;

    try {
      setIsDeleting(true);
      setHymnRows((currentRows) =>
        currentRows.filter((hymn) => hymn.id !== hymnId)
      );
      setHymnToDelete(null);

      await deleteHymnFn({ data: hymnId });
      await router.invalidate();
      toast.success(`Deleted "${hymnName}".`);
    } catch {
      setHymnRows(previousRows);
      toast.error("Unable to delete hymn. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const sourceOptions = useMemo(
    () => toSelectOptions(hymnRows.map((hymn) => hymn.sourceName)),
    [hymnRows]
  );
  const keyOptions = useMemo(
    () => toSelectOptions(hymnRows.map((hymn) => hymn.musicKey)),
    [hymnRows]
  );
  const sixMonthOptions = useMemo(() => {
    const uniquePlayCounts = [
      ...new Set(hymnRows.map((hymn) => hymn.timesPlayedLastSixMonths)),
    ];

    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include toSorted.
    return uniquePlayCounts.sort((first, second) => first - second);
  }, [hymnRows]);
  const filteredHymnRows = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    const fromTime = lastPlayedFrom ? Date.parse(lastPlayedFrom) : null;
    const toTime = lastPlayedTo ? Date.parse(lastPlayedTo) : null;

    return hymnRows.filter((hymn) => {
      const matchesSearch = normalizedSearchTerm
        ? `${hymn.hymnNumber} ${hymn.name}`
            .toLowerCase()
            .includes(normalizedSearchTerm)
        : true;
      const matchesSource =
        sourceFilter === ALL_FILTER_VALUE || hymn.sourceName === sourceFilter;
      const matchesKey =
        keyFilter === ALL_FILTER_VALUE || hymn.musicKey === keyFilter;
      const matchesSixMonths =
        sixMonthFilter === ALL_FILTER_VALUE ||
        hymn.timesPlayedLastSixMonths === Number(sixMonthFilter);
      const lastPlayedTime = Date.parse(hymn.lastPlayed);
      const matchesFrom =
        fromTime === null ||
        (!Number.isNaN(lastPlayedTime) && lastPlayedTime >= fromTime);
      const matchesTo =
        toTime === null ||
        (!Number.isNaN(lastPlayedTime) && lastPlayedTime <= toTime);

      return (
        matchesSearch &&
        matchesSource &&
        matchesKey &&
        matchesSixMonths &&
        matchesFrom &&
        matchesTo
      );
    });
  }, [
    hymnRows,
    keyFilter,
    lastPlayedFrom,
    lastPlayedTo,
    searchTerm,
    sixMonthFilter,
    sourceFilter,
  ]);

  const columns = createHymnColumns({
    hymnToDelete,
    isDeleting,
    onDelete: handleDelete,
    onOpenChange: (open, hymnId) => {
      setHymnToDelete(open ? hymnId : null);
    },
  });

  const hasActiveFilters =
    searchTerm !== "" ||
    sourceFilter !== ALL_FILTER_VALUE ||
    keyFilter !== ALL_FILTER_VALUE ||
    sixMonthFilter !== ALL_FILTER_VALUE ||
    lastPlayedFrom !== "" ||
    lastPlayedTo !== "";

  const handleClearFilters = () => {
    setSearchTerm("");
    setSourceFilter(ALL_FILTER_VALUE);
    setKeyFilter(ALL_FILTER_VALUE);
    setSixMonthFilter(ALL_FILTER_VALUE);
    setLastPlayedFrom("");
    setLastPlayedTo("");
  };

  const table = useReactTable({
    columns,
    data: filteredHymnRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Hymn Library
          </h1>
          <p className="text-muted-foreground">
            Manage hymn numbers, lyrics, keys, sources, and recent play history.
          </p>
        </div>
        <Button asChild>
          <Link to="/hymns/new">
            <PlusIcon data-icon="inline-start" />
            New hymn
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hymns</CardTitle>
          <CardDescription>
            Seed the library from db/song-library-seed.csv and select hymns
            while editing an order.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-2 lg:grid-cols-6">
            <Input
              className="lg:col-span-2"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search hymn no. or name"
              type="search"
              value={searchTerm}
            />
            <NativeSelect
              aria-label="Filter by source"
              onChange={(event) => setSourceFilter(event.target.value)}
              value={sourceFilter}
            >
              <NativeSelectOption value={ALL_FILTER_VALUE}>
                All sources
              </NativeSelectOption>
              {sourceOptions.map((source) => (
                <NativeSelectOption key={source} value={source}>
                  {source}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by key"
              onChange={(event) => setKeyFilter(event.target.value)}
              value={keyFilter}
            >
              <NativeSelectOption value={ALL_FILTER_VALUE}>
                All keys
              </NativeSelectOption>
              {keyOptions.map((musicKey) => (
                <NativeSelectOption key={musicKey} value={musicKey}>
                  {musicKey}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <NativeSelect
              aria-label="Filter by six month plays"
              onChange={(event) => setSixMonthFilter(event.target.value)}
              value={sixMonthFilter}
            >
              <NativeSelectOption value={ALL_FILTER_VALUE}>
                Any 6 mo. plays
              </NativeSelectOption>
              {sixMonthOptions.map((playCount) => (
                <NativeSelectOption key={playCount} value={String(playCount)}>
                  {playCount} plays
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <div className="grid grid-cols-2 gap-2 lg:col-span-5">
              <Input
                aria-label="Last played on or after"
                onChange={(event) => setLastPlayedFrom(event.target.value)}
                placeholder="Last played from"
                type="date"
                value={lastPlayedFrom}
              />
              <Input
                aria-label="Last played on or before"
                onChange={(event) => setLastPlayedTo(event.target.value)}
                placeholder="Last played to"
                type="date"
                value={lastPlayedTo}
              />
            </div>
            <Button
              disabled={!hasActiveFilters}
              onClick={handleClearFilters}
              type="button"
              variant="outline"
            >
              Clear filters
            </Button>
          </div>
          {hymnRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MusicNotesIcon />
                </EmptyMedia>
                <EmptyTitle>No hymns yet</EmptyTitle>
                <EmptyDescription>
                  Run the D1 seed migration or add a hymn manually.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/hymns/new">
                    <PlusIcon data-icon="inline-start" />
                    Add hymn
                  </Link>
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const sortDirection = header.column.getIsSorted();

                      return (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : (
                            <Button
                              className="h-auto px-0 font-semibold"
                              disabled={!header.column.getCanSort()}
                              onClick={header.column.getToggleSortingHandler()}
                              type="button"
                              variant="ghost"
                            >
                              {flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                              {renderSortIcon(sortDirection)}
                            </Button>
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      className="py-8 text-center text-muted-foreground"
                      colSpan={columns.length}
                    >
                      No hymns match the current filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id}>
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/hymns/")({
  component: HymnsPage,
  loader: () => getHymns(),
});
