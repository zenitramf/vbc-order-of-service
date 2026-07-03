import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  PlusIcon,
  TrashIcon,
  UsersThreeIcon,
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
import type { ColumnDef, SortingState } from "@tanstack/react-table";
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
import { deleteTeam, getTeams } from "~/lib/order-service-data";
import type { TeamSummary } from "~/lib/order-service-types";
import { requirePermission } from "~/lib/route-guards";

interface TeamColumnsOptions {
  isDeleting: boolean;
  onDelete: (teamId: string, teamName: string) => Promise<void>;
  onOpenChange: (open: boolean, teamId: string) => void;
  teamToDelete: string | null;
}

const renderSortIcon = (sortDirection: false | "asc" | "desc") => {
  if (sortDirection === "asc") {
    return <CaretUpIcon data-icon="inline-end" />;
  }

  if (sortDirection === "desc") {
    return <CaretDownIcon data-icon="inline-end" />;
  }

  return <CaretUpDownIcon data-icon="inline-end" />;
};

const createTeamColumns = ({
  isDeleting,
  onDelete,
  onOpenChange,
  teamToDelete,
}: TeamColumnsOptions): ColumnDef<TeamSummary>[] => [
  {
    accessorKey: "name",
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ teamId: row.original.id }}
        to="/teams/$teamId"
      >
        {row.original.name}
      </Link>
    ),
    header: "Team",
  },
  {
    accessorKey: "parentName",
    cell: ({ row }) =>
      row.original.parentName ? (
        <Badge variant="secondary">{row.original.parentName}</Badge>
      ) : (
        <span className="text-muted-foreground">Top level</span>
      ),
    header: "Parent team",
  },
  {
    accessorKey: "memberCount",
    cell: ({ row }) => row.original.memberCount,
    header: "Members",
  },
  {
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link params={{ teamId: row.original.id }} to="/teams/$teamId">
            Edit
          </Link>
        </Button>
        <AlertDialog
          onOpenChange={(open) => {
            onOpenChange(open, row.original.id);
          }}
          open={teamToDelete === row.original.id}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this team?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{row.original.name}" and detach
                its members. Sub-teams become top-level teams.
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

const TeamsPage = () => {
  const teams = Route.useLoaderData();
  const [teamRows, setTeamRows] = useState(teams);
  const router = useRouter();
  const deleteTeamFn = useServerFn(deleteTeam);
  const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setTeamRows(teams);
  }, [teams]);

  const handleDelete = async (teamId: string, teamName: string) => {
    const previousRows = teamRows;

    try {
      setIsDeleting(true);
      setTeamRows((currentRows) =>
        currentRows.filter((team) => team.id !== teamId)
      );
      setTeamToDelete(null);

      await deleteTeamFn({ data: teamId });
      await router.invalidate();
      toast.success(`Deleted "${teamName}".`);
    } catch {
      setTeamRows(previousRows);
      toast.error("Unable to delete team. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = createTeamColumns({
    isDeleting,
    onDelete: handleDelete,
    onOpenChange: (open, teamId) => {
      setTeamToDelete(open ? teamId : null);
    },
    teamToDelete,
  });

  const table = useReactTable({
    columns,
    data: teamRows,
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
            Teams
          </h1>
          <p className="text-muted-foreground">
            Manage the teams that serve in the order of service and the people
            on each team.
          </p>
        </div>
        <Button asChild>
          <Link to="/teams/new">
            <PlusIcon data-icon="inline-start" />
            New team
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team Management</CardTitle>
          <CardDescription>
            Select a team to manage its members and the templates that rely on
            it.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersThreeIcon />
                </EmptyMedia>
                <EmptyTitle>No teams yet</EmptyTitle>
                <EmptyDescription>
                  Add a team to start assigning members to services.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/teams/new">
                    <PlusIcon data-icon="inline-start" />
                    Add team
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

export const Route = createFileRoute("/_authenticated/teams/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "teams", "view");
  },
  component: TeamsPage,
  loader: () => getTeams(),
});
