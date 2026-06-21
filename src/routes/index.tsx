// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockIcon,
  ListChecksIcon,
  MusicNotesIcon,
  PlusIcon,
} from "@phosphor-icons/react";

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
import { getDashboardData } from "~/lib/order-service-data";
import type { OrderSummary } from "~/lib/order-service-types";

const formatDate = (value: string) =>
  value
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "medium",
      }).format(new Date(`${value}T00:00:00`))
    : "Unscheduled";

const StatusBadge = ({ status }: { status: OrderSummary["status"] }) => (
  <Badge variant={status === "Published" ? "default" : "secondary"}>{status}</Badge>
);

const OrderTable = ({ emptyText, orders }: { emptyText: string; orders: OrderSummary[] }) => {
  if (orders.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarCheckIcon />
          </EmptyMedia>
          <EmptyTitle>No services yet</EmptyTitle>
          <EmptyDescription>{emptyText}</EmptyDescription>
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
    );
  }

  return (
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
              <StatusBadge status={order.status} />
            </TableCell>
            <TableCell>
              {order.segmentCount} cards · {order.activityCount} activities
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

const Dashboard = () => {
  const data = Route.useLoaderData();
  const statCards = [
    {
      description: "Orders still being planned",
      icon: ClockIcon,
      label: "Planning",
      value: data.planningCount,
    },
    {
      description: "Orders sent with Publish and Send",
      icon: CheckCircleIcon,
      label: "Published",
      value: data.publishedCount,
    },
    {
      description: "Reusable service plans",
      icon: ListChecksIcon,
      label: "Templates",
      value: data.templateCount,
    },
    {
      description: "Songs available for service planning",
      icon: MusicNotesIcon,
      label: "Hymns",
      value: data.hymnCount,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">Order of Service Dashboard</h1>
          <p className="text-muted-foreground">
            Create, plan, and publish church orders of service for upcoming Sundays and special meetings.
          </p>
        </div>
        <Button asChild>
          <Link to="/orders/new">
            <PlusIcon data-icon="inline-start" />
            New order
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.label}>
              <CardHeader className="flex flex-row items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <CardDescription>{card.label}</CardDescription>
                  <CardTitle className="text-3xl">{card.value}</CardTitle>
                </div>
                <Icon className="text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{card.description}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upcoming orders of service</CardTitle>
            <CardDescription>Services scheduled today or later.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrderTable emptyText="Create your first upcoming service from a template." orders={data.upcomingOrders} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Previous orders of service</CardTitle>
            <CardDescription>Recently completed or past services and their status.</CardDescription>
          </CardHeader>
          <CardContent>
            <OrderTable emptyText="Past services will appear after their service date passes." orders={data.previousOrders} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Dashboard,
  loader: () => getDashboardData(),
});
