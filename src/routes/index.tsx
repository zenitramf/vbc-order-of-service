import {
  ArrowRightIcon,
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
import type { DashboardData, OrderSummary } from "~/lib/order-service-types";

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

const formatDaysRemaining = (daysRemaining: number) =>
  daysRemaining === 1 ? "1 day remaining" : `${daysRemaining} days remaining`;

const UpcomingSundayCard = ({
  nextSundayDate,
  order,
}: {
  nextSundayDate: string;
  order: OrderSummary | null;
}) => {
  const daysRemaining = getDaysRemaining(nextSundayDate);

  return (
    <Card>
      <CardHeader>
        <CardDescription>Upcoming Sunday</CardDescription>
        <CardTitle className="text-2xl">
          {formatFullDate(nextSundayDate)}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatDaysRemaining(daysRemaining)}
        </p>
      </CardHeader>
      {order ? (
        <>
          <CardFooter>
            <Button asChild>
              <Link params={{ orderId: order.id }} to="/orders/$orderId">
                <PencilSimpleIcon data-icon="inline-start" />
                Edit order of service
              </Link>
            </Button>
          </CardFooter>
        </>
      ) : (
        <>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No order of service has been created for this Sunday yet.
            </p>
          </CardContent>
          <CardFooter>
            <Button asChild>
              <Link to="/orders/new">
                <PlusIcon data-icon="inline-start" />
                Create order of service
              </Link>
            </Button>
          </CardFooter>
        </>
      )}
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
              className="flex flex-col gap-1 rounded-lg border p-4 transition-colors hover:bg-muted/50"
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

      <UpcomingSundayCard
        nextSundayDate={data.nextSundayDate}
        order={data.nextSundayOrder}
      />

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
                <p className="text-sm text-muted-foreground">
                  {card.description}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <TeamMembersSection
        teamCount={data.teamCount}
        teamMemberCount={data.teamMemberCount}
        teams={data.teams}
      />
    </div>
  );
};

export const Route = createFileRoute("/")({
  component: Dashboard,
  loader: () => getDashboardData(),
});
