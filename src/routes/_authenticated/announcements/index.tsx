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
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row, SortingState } from "@tanstack/react-table";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
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
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
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
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
} from "~/lib/announcement-data";
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
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge
          variant={row.original.status === "approved" ? "default" : "secondary"}
        >
          {row.original.status === "approved" ? "Approved" : "Draft"}
        </Badge>
        {row.original.status === "approved" &&
        row.original.showInPresentationDeck ? (
          <Badge className="border-transparent bg-emerald-600 text-white hover:bg-emerald-600/90">
            In presentation deck
          </Badge>
        ) : null}
      </div>
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

const NewAnnouncementDialog = ({
  onOpenChange,
  open,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) => {
  const navigate = useNavigate();
  const createFn = useServerFn(createAnnouncement);
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (!open) {
      setName("");
      setTitle("");
      setIsCreating(false);
    }
  }, [open]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsCreating(true);

    try {
      const { id } = await createFn({
        data: {
          name,
          title: title || name,
        },
      });

      toast.success("Announcement draft created.");
      onOpenChange(false);
      await navigate({
        params: { announcementId: id },
        to: "/announcements/$announcementId",
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not create announcement."
      );
      setIsCreating(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>New announcement</DialogTitle>
            <DialogDescription>
              Name the draft, then fill in overlays, backgrounds, and styles in
              the editor.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-name">Announcement name</Label>
              <Input
                autoFocus
                id="announcement-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Easter Sunday Invite"
                required
                value={name}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="announcement-title">Title</Label>
              <Input
                id="announcement-title"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Defaults to announcement name"
                value={title}
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button disabled={isCreating} type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button disabled={isCreating || !name.trim()} type="submit">
              {isCreating ? "Creating…" : "Open editor"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

const AnnouncementsPage = () => {
  const announcements = Route.useLoaderData();
  const { create: openCreateFromSearch } = Route.useSearch();
  const navigate = useNavigate();
  const [announcementRows, setAnnouncementRows] = useState(announcements);
  const router = useRouter();
  const deleteFn = useServerFn(deleteAnnouncement);
  const [announcementToDelete, setAnnouncementToDelete] = useState<
    string | null
  >(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(
    Boolean(openCreateFromSearch)
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([
    { desc: true, id: "updatedAt" },
  ]);

  useEffect(() => {
    setAnnouncementRows(announcements);
  }, [announcements]);

  useEffect(() => {
    if (openCreateFromSearch) {
      setCreateDialogOpen(true);
    }
  }, [openCreateFromSearch]);

  const handleCreateDialogOpenChange = (open: boolean) => {
    setCreateDialogOpen(open);

    if (!open && openCreateFromSearch) {
      void navigate({
        replace: true,
        search: { create: undefined },
        to: "/announcements",
      });
    }
  };

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
        <div className="flex flex-wrap gap-2">
          <Button asChild type="button" variant="outline">
            <a href="/presentation" rel="noopener" target="_blank">
              <MegaphoneIcon data-icon="inline-start" />
              Open presentation deck
            </a>
          </Button>
          <Button
            onClick={() => {
              setCreateDialogOpen(true);
            }}
            type="button"
          >
            <PlusIcon data-icon="inline-start" />
            New announcement
          </Button>
        </div>
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
                <Button
                  onClick={() => {
                    setCreateDialogOpen(true);
                  }}
                  type="button"
                >
                  <PlusIcon data-icon="inline-start" />
                  Create announcement
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

      <NewAnnouncementDialog
        onOpenChange={handleCreateDialogOpenChange}
        open={createDialogOpen}
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/announcements/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: AnnouncementsPage,
  loader: () => listAnnouncements(),
  validateSearch: (search: Record<string, unknown>): { create?: boolean } => ({
    create:
      search.create === true || search.create === "true" || search.create === 1
        ? true
        : undefined,
  }),
});
