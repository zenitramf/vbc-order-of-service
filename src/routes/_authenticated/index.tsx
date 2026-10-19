import {
  ArrowRightIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockIcon,
  ListChecksIcon,
  MusicNotesIcon,
  PencilSimpleIcon,
  PlusIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { DashboardPageSkeleton } from "~/components/loading-skeletons";
import {
  OrderOverviewRow,
  OrderRosterSummary,
  OrderStatusBadge,
  RosterAttention,
} from "~/components/order-roster";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { getDashboardData } from "~/lib/order-service-data";
import type { DashboardData, OrderOverview } from "~/lib/order-service-types";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

const formatFullDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "full",
  }).format(new Date(`${value}T00:00:00`));

const getDaysRemaining = (value: string) => {
  const targetDate = new Date(`${value}T00:00:00`);
  const today = new Date();
  const todayDate = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  return Math.max(
    0,
    Math.round(
      (targetDate.getTime() - todayDate.getTime()) / millisecondsPerDay
    )
  );
};

const formatDaysRemaining = (daysRemaining: number) => {
  if (daysRemaining === 0) {
    return "Today";
  }

  if (daysRemaining === 1) {
    return "Tomorrow";
  }

  return `In ${daysRemaining} days`;
};

const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

const NextServiceCard = ({
  month,
  nextOrder,
  nextSundayDate,
}: {
  month: string;
  nextOrder: OrderOverview | null;
  nextSundayDate: string;
}) => (
  <Card>
    <CardHeader>
      <div>
        <Badge variant="info">Next service</Badge>
      </div>
      <CardTitle className="text-2xl">
        {formatFullDate(nextOrder?.serviceDate ?? nextSundayDate)}
      </CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          {nextOrder
            ? `${formatDaysRemaining(getDaysRemaining(nextOrder.serviceDate))} · ${nextOrder.title}`
            : "No upcoming order of service yet."}
        </p>
        {nextOrder ? <OrderStatusBadge status={nextOrder.status} /> : null}
        {nextOrder ? <RosterAttention roster={nextOrder.roster} /> : null}
      </div>
    </CardHeader>
    {nextOrder ? (
      <>
        <CardContent>
          <OrderRosterSummary roster={nextOrder.roster} />
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            asChild
            className="h-11 px-6 text-base"
            size="lg"
            variant="cta"
          >
            <Link params={{ orderId: nextOrder.id }} to="/orders/$orderId">
              <PencilSimpleIcon data-icon="inline-start" />
              Open next order
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link search={{ month }} to="/planner">
              <CalendarCheckIcon data-icon="inline-start" />
              Month Planner
            </Link>
          </Button>
        </CardFooter>
      </>
    ) : (
      <>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Create the order for {formatFullDate(nextSundayDate)}, or plan the
            whole month at once.
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/orders/new">
              <PlusIcon data-icon="inline-start" />
              Create order of service
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link search={{ month }} to="/planner">
              <CalendarCheckIcon data-icon="inline-start" />
              Month Planner
            </Link>
          </Button>
        </CardFooter>
      </>
    )}
  </Card>
);

const MonthOrdersSection = ({
  month,
  monthOrders,
  nextOrderId,
}: {
  month: string;
  monthOrders: OrderOverview[];
  nextOrderId?: string;
}) => {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <CardTitle>This month</CardTitle>
          <CardDescription>
            {formatMonthLabel(month)} — every order and who is serving.
          </CardDescription>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link search={{ month }} to="/planner">
            Plan month
            <ArrowRightIcon data-icon="inline-end" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {monthOrders.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <CalendarCheckIcon />
              </EmptyMedia>
              <EmptyTitle>No orders this month</EmptyTitle>
              <EmptyDescription>
                Plan the month to create its services, then assign teams to each
                one.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link search={{ month }} to="/planner">
                  <CalendarCheckIcon data-icon="inline-start" />
                  Open Month Planner
                </Link>
              </Button>
            </EmptyContent>
          </Empty>
        ) : (
          <div className="flex flex-col divide-y">
            {monthOrders.map((order) => (
              <OrderOverviewRow
                badge={order.id === nextOrderId ? <Badge>Next</Badge> : null}
                dimmed={order.serviceDate < today}
                highlighted={order.id === nextOrderId}
                key={order.id}
                order={order}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const TeamMembersSection = ({
  teamCount,
  teamMemberCount,
  teams,
}: Pick<DashboardData, "teamCount" | "teamMemberCount" | "teams">) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>Team members</CardTitle>
        <CardDescription>
          {teamMemberCount} {teamMemberCount === 1 ? "member" : "members"}{" "}
          across {teamCount} {teamCount === 1 ? "team" : "teams"}.
        </CardDescription>
      </div>
      <Button asChild size="sm" variant="outline">
        <Link to="/members">
          Manage
          <ArrowRightIcon data-icon="inline-end" />
        </Link>
      </Button>
    </CardHeader>
    <CardContent>
      {teams.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersThreeIcon />
            </EmptyMedia>
            <EmptyTitle>No teams yet</EmptyTitle>
            <EmptyDescription>
              Create teams to organize serving volunteers.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button asChild>
              <Link to="/teams/new">
                <PlusIcon data-icon="inline-start" />
                Create team
              </Link>
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Link
              className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:border-primary/30 hover:bg-accent/50"
              key={team.id}
              params={{ teamId: team.id }}
              to="/teams/$teamId"
            >
              <span className="flex items-center justify-between gap-2 font-medium">
                {team.name}
                <Badge variant="secondary">{team.memberCount}</Badge>
              </span>
              <span className="text-sm text-muted-foreground">
                {team.parentName ? `Part of ${team.parentName}` : "Team"}
              </span>
            </Link>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
);

const StatCardsSection = ({
  hymnCount,
  planningCount,
  publishedCount,
  templateCount,
}: Pick<
  DashboardData,
  "hymnCount" | "planningCount" | "publishedCount" | "templateCount"
>) => {
  const statCards = [
    {
      description: "Orders still being planned",
      icon: ClockIcon,
      label: "Planning",
      tone: "bg-warning/15 text-warning",
      value: planningCount,
    },
    {
      description: "Orders sent with Publish and Send",
      icon: CheckCircleIcon,
      label: "Published",
      tone: "bg-success/15 text-success",
      value: publishedCount,
    },
    {
      description: "Reusable service plans",
      icon: ListChecksIcon,
      label: "Templates",
      tone: "bg-info/15 text-info",
      value: templateCount,
    },
    {
      description: "Songs available for service planning",
      icon: MusicNotesIcon,
      label: "Hymns",
      tone: "bg-primary/12 text-primary",
      value: hymnCount,
    },
  ];

  return (
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
              <span
                className={`flex size-10 items-center justify-center rounded-xl [&_svg]:size-5 ${card.tone}`}
              >
                <Icon />
              </span>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {card.description}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

const Dashboard = () => {
  const data = Route.useLoaderData();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            Order of Service Dashboard
          </h1>
          <p className="text-muted-foreground">
            Create, plan, and publish church orders of service for upcoming
            Sundays and special meetings.
          </p>
        </div>
        <Button asChild>
          <Link to="/orders/new">
            <PlusIcon data-icon="inline-start" />
            New order
          </Link>
        </Button>
      </div>

      <NextServiceCard
        month={data.month}
        nextOrder={data.nextOrder}
        nextSundayDate={data.nextSundayDate}
      />

      <MonthOrdersSection
        month={data.month}
        monthOrders={data.monthOrders}
        nextOrderId={data.nextOrder?.id}
      />

      <StatCardsSection
        hymnCount={data.hymnCount}
        planningCount={data.planningCount}
        publishedCount={data.publishedCount}
        templateCount={data.templateCount}
      />

      <TeamMembersSection
        teamCount={data.teamCount}
        teamMemberCount={data.teamMemberCount}
        teams={data.teams}
      />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
  loader: () => getDashboardData(),
  pendingComponent: DashboardPageSkeleton,
});
