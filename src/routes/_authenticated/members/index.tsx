import {
  CaretDownIcon,
  CaretUpDownIcon,
  CaretUpIcon,
  PlusIcon,
  TrashIcon,
  UserCircleIcon,
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
import {
  deleteTeamMember,
  getTeamMembers,
  getTeams,
} from "~/lib/order-service-data";
import type { TeamMemberSummary } from "~/lib/order-service-types";

interface MemberColumnsOptions {
  isDeleting: boolean;
  memberToDelete: string | null;
  onDelete: (memberId: string, memberName: string) => Promise<void>;
  onOpenChange: (open: boolean, memberId: string) => void;
}

const ALL_FILTER_VALUE = "all";

const renderSortIcon = (sortDirection: false | "asc" | "desc") => {
  if (sortDirection === "asc") {
    return <CaretUpIcon data-icon="inline-end" />;
  }

  if (sortDirection === "desc") {
    return <CaretDownIcon data-icon="inline-end" />;
  }

  return <CaretUpDownIcon data-icon="inline-end" />;
};

const fullName = (member: TeamMemberSummary) =>
  `${member.firstName} ${member.lastName}`.trim();

const createMemberColumns = ({
  isDeleting,
  memberToDelete,
  onDelete,
  onOpenChange,
}: MemberColumnsOptions): ColumnDef<TeamMemberSummary>[] => [
  {
    accessorFn: fullName,
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ memberId: row.original.id }}
        to="/members/$memberId"
      >
        {fullName(row.original) || "Unnamed member"}
      </Link>
    ),
    header: "Name",
    id: "name",
  },
  {
    accessorKey: "email",
    cell: ({ row }) => row.original.email || "—",
    header: "Email",
  },
  {
    accessorKey: "phone",
    cell: ({ row }) => row.original.phone || "—",
    header: "Phone",
  },
  {
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.teamNames.length === 0 ? (
          <span className="text-muted-foreground">No teams</span>
        ) : (
          row.original.teamNames.map((teamName) => (
            <Badge key={teamName} variant="secondary">
              {teamName}
            </Badge>
          ))
        )}
      </div>
    ),
    enableSorting: false,
    header: "Teams",
    id: "teams",
  },
  {
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link params={{ memberId: row.original.id }} to="/members/$memberId">
            Edit
          </Link>
        </Button>
        <AlertDialog
          onOpenChange={(open) => {
            onOpenChange(open, row.original.id);
          }}
          open={memberToDelete === row.original.id}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this member?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{fullName(row.original)}" and
                detach them from all teams.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={async () => {
                  await onDelete(row.original.id, fullName(row.original));
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

const MembersPage = () => {
  const { members, teams } = Route.useLoaderData();
  const [memberRows, setMemberRows] = useState(members);
  const router = useRouter();
  const deleteTeamMemberFn = useServerFn(deleteTeamMember);
  const [memberToDelete, setMemberToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [teamFilter, setTeamFilter] = useState(ALL_FILTER_VALUE);

  useEffect(() => {
    setMemberRows(members);
  }, [members]);

  const handleDelete = async (memberId: string, memberName: string) => {
    const previousRows = memberRows;

    try {
      setIsDeleting(true);
      setMemberRows((currentRows) =>
        currentRows.filter((member) => member.id !== memberId)
      );
      setMemberToDelete(null);

      await deleteTeamMemberFn({ data: memberId });
      await router.invalidate();
      toast.success(`Deleted "${memberName}".`);
    } catch {
      setMemberRows(previousRows);
      toast.error("Unable to delete member. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return memberRows.filter((member) => {
      const matchesSearch = normalizedSearch
        ? `${fullName(member)} ${member.email}`
            .toLowerCase()
            .includes(normalizedSearch)
        : true;
      const matchesTeam =
        teamFilter === ALL_FILTER_VALUE || member.teamIds.includes(teamFilter);

      return matchesSearch && matchesTeam;
    });
  }, [memberRows, searchTerm, teamFilter]);

  const columns = createMemberColumns({
    isDeleting,
    memberToDelete,
    onDelete: handleDelete,
    onOpenChange: (open, memberId) => {
      setMemberToDelete(open ? memberId : null);
    },
  });

  const table = useReactTable({
    columns,
    data: filteredRows,
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
            Team Members
          </h1>
          <p className="text-muted-foreground">
            Everyone who serves across the church teams. Members can belong to
            multiple teams.
          </p>
        </div>
        <Button asChild>
          <Link to="/members/new">
            <PlusIcon data-icon="inline-start" />
            New member
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            Select a member to edit their profile and team assignments.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Input
              className="md:col-span-2"
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name or email"
              type="search"
              value={searchTerm}
            />
            <NativeSelect
              aria-label="Filter by team"
              onChange={(event) => setTeamFilter(event.target.value)}
              value={teamFilter}
            >
              <NativeSelectOption value={ALL_FILTER_VALUE}>
                All teams
              </NativeSelectOption>
              {teams.map((team) => (
                <NativeSelectOption key={team.id} value={team.id}>
                  {team.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          {memberRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UserCircleIcon />
                </EmptyMedia>
                <EmptyTitle>No members yet</EmptyTitle>
                <EmptyDescription>
                  Add team members to assign them to services.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/members/new">
                    <PlusIcon data-icon="inline-start" />
                    Add member
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
                              {header.column.getCanSort()
                                ? renderSortIcon(sortDirection)
                                : null}
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
                      No members match the current filters.
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

export const Route = createFileRoute("/_authenticated/members/")({
  component: MembersPage,
  loader: async () => {
    const [members, teams] = await Promise.all([getTeamMembers(), getTeams()]);

    return { members, teams };
  },
});
