import { MusicNotesIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";
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

const createHymnColumns = ({
  hymnToDelete,
  isDeleting,
  onDelete,
  onOpenChange,
}: HymnColumnsOptions): ColumnDef<HymnRecord>[] => [
  {
    accessorKey: "hymnNumber",
    header: "No.",
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

  const columns = createHymnColumns({
    hymnToDelete,
    isDeleting,
    onDelete: handleDelete,
    onOpenChange: (open, hymnId) => {
      setHymnToDelete(open ? hymnId : null);
    },
  });

  const table = useReactTable({
    columns,
    data: hymnRows,
    getCoreRowModel: getCoreRowModel(),
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
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
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
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/hymns/")({
  component: HymnsPage,
  loader: () => getHymns(),
});
