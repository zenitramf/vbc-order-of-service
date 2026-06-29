import { CalendarCheckIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
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
import { deleteOrder, getOrders } from "~/lib/order-service-data";
import type { OrderSummary } from "~/lib/order-service-types";

interface OrderColumnsOptions {
  isDeleting: boolean;
  onDelete: (orderId: string, orderTitle: string) => Promise<void>;
  onOpenChange: (open: boolean, orderId: string) => void;
  orderToDelete: string | null;
}

const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
        new Date(`${value}T00:00:00`)
      )
    : "Unscheduled";

const createOrderColumns = ({
  isDeleting,
  onDelete,
  onOpenChange,
  orderToDelete,
}: OrderColumnsOptions): ColumnDef<OrderSummary>[] => [
  {
    accessorKey: "title",
    cell: ({ row }) => (
      <Link
        className="font-medium hover:underline"
        params={{ orderId: row.original.id }}
        to="/orders/$orderId"
      >
        {row.original.title}
      </Link>
    ),
    header: "Service",
  },
  {
    accessorKey: "serviceDate",
    cell: ({ row }) => formatDate(row.original.serviceDate),
    header: "Date",
  },
  {
    accessorKey: "serviceTypeName",
    cell: ({ row }) => (
      <Badge variant="secondary">{row.original.serviceTypeName}</Badge>
    ),
    header: "Type",
  },
  {
    accessorKey: "status",
    cell: ({ row }) => (
      <Badge
        variant={row.original.status === "Published" ? "default" : "secondary"}
      >
        {row.original.status}
      </Badge>
    ),
    header: "Status",
  },
  {
    cell: ({ row }) => (
      <span>
        {row.original.segmentCount} cards · {row.original.activityCount}{" "}
        activities
      </span>
    ),
    header: "Plan",
    id: "plan",
  },
  {
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button asChild size="sm" variant="outline">
          <Link params={{ orderId: row.original.id }} to="/orders/$orderId">
            Edit
          </Link>
        </Button>
        <AlertDialog
          onOpenChange={(open) => {
            onOpenChange(open, row.original.id);
          }}
          open={orderToDelete === row.original.id}
        >
          <AlertDialogTrigger asChild>
            <Button size="sm" type="button" variant="ghost">
              <TrashIcon data-icon="inline-start" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this order of service?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove "{row.original.title}".
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                disabled={isDeleting}
                onClick={async () => {
                  await onDelete(row.original.id, row.original.title);
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

const OrdersPage = () => {
  const orders = Route.useLoaderData();
  const [orderRows, setOrderRows] = useState(orders);
  const router = useRouter();
  const deleteOrderFn = useServerFn(deleteOrder);
  const [orderToDelete, setOrderToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    setOrderRows(orders);
  }, [orders]);

  const handleDelete = async (orderId: string, orderTitle: string) => {
    const previousRows = orderRows;

    try {
      setIsDeleting(true);
      setOrderRows((currentRows) =>
        currentRows.filter((order) => order.id !== orderId)
      );
      setOrderToDelete(null);

      await deleteOrderFn({ data: orderId });
      await router.invalidate();
      toast.success(`Deleted "${orderTitle}".`);
    } catch {
      setOrderRows(previousRows);
      toast.error("Unable to delete order. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const columns = createOrderColumns({
    isDeleting,
    onDelete: handleDelete,
    onOpenChange: (open, orderId) => {
      setOrderToDelete(open ? orderId : null);
    },
    orderToDelete,
  });

  const table = useReactTable({
    columns,
    data: orderRows,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Orders of Service
          </h1>
          <p className="text-muted-foreground">
            Review previous services and continue planning upcoming services.
          </p>
        </div>
        <Button asChild>
          <Link to="/orders/new">
            <PlusIcon data-icon="inline-start" />
            New order
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All orders</CardTitle>
          <CardDescription>
            Planning and published orders sorted by service date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orderRows.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarCheckIcon />
                </EmptyMedia>
                <EmptyTitle>No orders yet</EmptyTitle>
                <EmptyDescription>
                  Create an order from a template to begin planning.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button asChild>
                  <Link to="/orders/new">
                    <PlusIcon data-icon="inline-start" />
                    Create order
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

export const Route = createFileRoute("/orders/")({
  component: OrdersPage,
  loader: () => getOrders(),
});
