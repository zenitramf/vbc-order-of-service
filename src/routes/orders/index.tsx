// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";
import { CalendarCheckIcon, PlusIcon } from "@phosphor-icons/react";

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
import { getOrders } from "~/lib/order-service-data";

const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(
        new Date(`${value}T00:00:00`)
      )
    : "Unscheduled";

const OrdersPage = () => {
  const orders = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Orders of Service</h1>
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
          <CardDescription>Planning and published orders sorted by service date.</CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CalendarCheckIcon />
                </EmptyMedia>
                <EmptyTitle>No orders yet</EmptyTitle>
                <EmptyDescription>Create an order from a template to begin planning.</EmptyDescription>
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
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Plan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <Link className="font-medium hover:underline" params={{ orderId: order.id }} to="/orders/$orderId">
                        {order.title}
                      </Link>
                    </TableCell>
                    <TableCell>{formatDate(order.serviceDate)}</TableCell>
                    <TableCell>{order.serviceTypeName}</TableCell>
                    <TableCell>
                      <Badge variant={order.status === "Published" ? "default" : "secondary"}>
                        {order.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {order.segmentCount} cards · {order.activityCount} activities
                    </TableCell>
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
