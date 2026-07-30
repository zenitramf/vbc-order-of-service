import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  DotsThreeVerticalIcon,
  MegaphoneIcon,
  PencilSimpleIcon,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import { deleteAnnouncement, listAnnouncements } from "~/lib/announcement-data";
import type { AnnouncementSummary } from "~/lib/announcement-types";
import { requirePermission } from "~/lib/route-guards";

interface AnnouncementColumnsOptions {
  announcementToDelete: string | null;
  isDeleting: boolean;
  onDelete: (id: string, name: string) => Promise<void>;
  onOpenChange: (open: boolean, id: string) => void;
}

const formatWhen = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

const sortDate =
  (key: "createdAt" | "updatedAt" | "approvedAt") =>
  (rowA: Row<AnnouncementSummary>, rowB: Row<AnnouncementSummary>) =>
    (Date.parse(rowA.original[key] ?? "") || 0) -
    (Date.parse(rowB.original[key] ?? "") || 0);

const renderSortIcon = (sortDirection: false | "asc" | "desc") => {
  if (sortDirection === "asc") {
    return <CaretUpIcon data-icon="inline-end" />;
  }

  if (sortDirection === "desc") {
    return <CaretDownIcon data-icon="inline-end" />;
  }

  return <CaretUpDownIcon data-icon="inline-end" />;
};

const createAnnouncementColumns = ({
  announcementToDelete,
  isDeleting,
  onDelete,
  onOpenChange,
}: AnnouncementColumnsOptions): ColumnDef<AnnouncementSummary>[] => [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ announcementId: row.original.id }}
        to="/announcements/$announcementId"
      >
        {row.original.name}
      </Link>
    ),
    header: "Name",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "approved" ? "default" : "secondary"}
      >
        {row.original.status === "approved" ? "Approved" : "Draft"}
      </Badge>
    ),
    header: "Status",
  },
  {
    accessorKey: "variationCount",
    cell: ({ row }) => row.original.variationCount,
    header: "Variations",
  },
  {
    accessorKey: "updatedAt",
    cell: ({ row }) => formatWhen(row.original.updatedAt),
    header: "Updated",
    sortingFn: sortDate("updatedAt"),
  },
  {
    cell: ({ row }) => (
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={`Actions for ${row.original.name}`}
              size="icon"
              type="button"
              variant="ghost"
            >
              <DotsThreeVerticalIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                params={{ announcementId: row.original.id }}
                to="/announcements/$announcementId"
              >
                <PencilSimpleIcon data-icon="inline-start" />
                Edit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                onOpenChange(true, row.original.id);
              }}
              variant="destructive"
            >
              <TrashIcon data-icon="inline-start" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <AlertDialog
          onOpenChange={(open) => {
            onOpenChange(open, row.original.id);
          }}
          open={announcementToDelete === row.original.id}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this announcement?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{row.original.name}" and its
                background variations and exports.
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
    enableSorting: false,
    header: () => <span className="sr-only">Actions</span>,
    id: "actions",
  },
];

const AnnouncementsPage = () => {
  const announcements = Route.useLoaderData();
  const [announcementRows, setAnnouncementRows] = useState(announcements);
  const router = useRouter();
  const deleteFn = useServerFn(deleteAnnouncement);
  const [announcementToDelete, setAnnouncementToDelete] = useState<
    string | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "updatedAt" },
  ]);

  useEffect(() => {
    setAnnouncementRows(announcements);
  }, [announcements]);

  const handleDelete = async (id: string, name: string) => {
    const previousRows = announcementRows;

    try {
      setIsDeleting(true);
      setAnnouncementRows((currentRows) =>
        currentRows.filter((item) => item.id !== id)
      );
      setAnnouncementToDelete(null);

      await deleteFn({ data: id });
      await router.invalidate();
      toast.success(`Deleted "${name}".`);
    } catch (error) {
      setAnnouncementRows(previousRows);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not delete announcement."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = createAnnouncementColumns({
    announcementToDelete,
    isDeleting,
    onDelete: handleDelete,
    onOpenChange: (open, id) => {
      setAnnouncementToDelete(open ? id : null);
    },
  });

  const table = useReactTable({
    columns,
    data: announcementRows,
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
            Announcements
          </h1>
          <p className="text-muted-foreground">
            AI background images with HTML text overlays. Drafts and exports
            live in R2 at 1920×1080.
          </p>
        </div>
        <Button asChild>
          <Link to="/announcements/new">
            <PlusIcon data-icon="inline-start" />
            New announcement
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All announcements</CardTitle>
          <CardDescription>
            Open a draft to edit overlays and backgrounds, or approve an export
            for use.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {announcementRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <MegaphoneIcon />
                </EmptyMedia>
                <EmptyTitle>No announcements yet</EmptyTitle>
                <EmptyDescription>
                  Create an announcement, generate background variations,
                  overlay title hierarchy with HTML, and export an approved JPG.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/announcements/new">
                    <PlusIcon data-icon="inline-start" />
                    Create announcement
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
                      if (header.isPlaceholder) {
                        return <TableHead key={header.id} />;
                      }

                      const sortDirection = header.column.getIsSorted();
                      const headerContent = flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      );

                      if (!header.column.getCanSort()) {
                        return (
                          <TableHead key={header.id}>{headerContent}</TableHead>
                        );
                      }

                      return (
                        <TableHead key={header.id}>
                          <Button
                            className="h-auto px-0 font-semibold"
                            onClick={header.column.getToggleSortingHandler()}
                            type="button"
                            variant="ghost"
                          >
                            {headerContent}
                            {renderSortIcon(sortDirection)}
                          </Button>
                        </TableHead>
                      );
                    })}
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

export const Route = createFileRoute("/_authenticated/announcements/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: AnnouncementsPage,
  loader: () => listAnnouncements(),
});
