// oxlint-disable no-use-before-define
import {
  MagnifyingGlassIcon,
  UserPlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type { ColumnDef } from "@tanstack/react-table";
import { useEffect, useState } from "react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { listUsersAdmin } from "~/lib/admin-data";
import type { AdminUserSummary } from "~/lib/admin-data";

const formatDate = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

const columns: ColumnDef<AdminUserSummary>[] = [
  {
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ userId: row.original.id }}
        to="/admin/users/$userId"
      >
        {row.original.name || "Unnamed user"}
      </Link>
    ),
    header: "Name",
    id: "name",
  },
  {
    accessorKey: "email",
    header: "Email",
  },
  {
    cell: ({ row }) =>
      row.original.role ? (
        <Badge variant="secondary">{row.original.role}</Badge>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    header: "Role",
    id: "role",
  },
  {
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-1">
        {row.original.banned ? (
          <Badge variant="destructive">Banned</Badge>
        ) : null}
        {row.original.emailVerified ? (
          <Badge variant="outline">Verified</Badge>
        ) : (
          <Badge variant="outline">Unverified</Badge>
        )}
      </div>
    ),
    header: "Status",
    id: "status",
  },
  {
    accessorKey: "createdAt",
    cell: ({ row }) => formatDate(row.original.createdAt),
    header: "Joined",
  },
  {
    cell: ({ row }) => (
      <Button asChild size="sm" variant="outline">
        <Link params={{ userId: row.original.id }} to="/admin/users/$userId">
          Edit
        </Link>
      </Button>
    ),
    header: "Actions",
    id: "actions",
  },
];

const UsersPage = () => {
  const { page, pageCount, search, total, users } = Route.useLoaderData();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState(search);

  useEffect(() => {
    setSearchTerm(search);
  }, [search]);

  const goToPage = (nextPage: number) => {
    navigate({
      search: { page: nextPage, search },
      to: "/admin/users",
    });
  };

  const submitSearch = () => {
    navigate({
      search: { page: 1, search: searchTerm.trim() },
      to: "/admin/users",
    });
  };

  const table = useReactTable({
    columns,
    data: users,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Users
          </h1>
          <p className="text-muted-foreground">
            Manage accounts, roles, sessions, and access across the app.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/users/new">
            <UserPlusIcon data-icon="inline-start" />
            New user
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            {total} {total === 1 ? "user" : "users"} total.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex gap-2">
            <Input
              onChange={(event) => setSearchTerm(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitSearch();
                }
              }}
              placeholder="Search by name or email"
              type="search"
              value={searchTerm}
            />
            <Button onClick={submitSearch} type="button" variant="outline">
              <MagnifyingGlassIcon data-icon="inline-start" />
              Search
            </Button>
          </div>

          {users.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <UsersThreeIcon className="size-8" />
              <p>No users match your search.</p>
            </div>
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

          <div className="mt-4 flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              Page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={page >= pageCount}
                onClick={() => goToPage(page + 1)}
                size="sm"
                type="button"
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/admin/users/")({
  component: UsersPage,
  loader: ({ deps }) => listUsersAdmin({ data: deps }),
  loaderDeps: ({ search }) => ({ page: search.page, search: search.search }),
  validateSearch: (
    search: Record<string, unknown>
  ): { page?: number; search?: string } => ({
    page:
      typeof search.page === "number" && search.page > 0
        ? Math.floor(search.page)
        : undefined,
    search:
      typeof search.search === "string" && search.search
        ? search.search
        : undefined,
  }),
});
