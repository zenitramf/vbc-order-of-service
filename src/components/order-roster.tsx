// oxlint-disable no-use-before-define
import {
  ArrowRightIcon,
  MusicNotesIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import type {
  OrderOverview,
  OrderRoster,
  RosterMember,
  RosterTeam,
} from "~/lib/order-service-types";
import { getInitials } from "~/lib/teams-logic";
import { cn } from "~/lib/utils";

const MAX_COMPACT_MEMBERS = 4;

export const formatRosterMemberName = (member: RosterMember): string =>
  `${member.firstName} ${member.lastName}`.trim();

const formatMemberNames = (team: RosterTeam): string => {
  const names = team.members.map((member) => formatRosterMemberName(member));
  const visible = names.slice(0, MAX_COMPACT_MEMBERS).join(", ");
  const extra = names.length - MAX_COMPACT_MEMBERS;

  return extra > 0 ? `${visible}, +${extra} more` : visible;
};

/** "Counters · Ushers" so sub-teams keep their parent context at a glance. */
const teamDisplayName = (team: RosterTeam): string =>
  team.parentName ? `${team.teamName} · ${team.parentName}` : team.teamName;

const TeamMissingBadge = ({ team }: { team: RosterTeam }) =>
  team.missingCount > 0 ? (
    <Badge variant="destructive">
      <WarningCircleIcon />
      {team.assignedCount === 0
        ? "Unstaffed"
        : `Needs ${team.missingCount} more`}
    </Badge>
  ) : null;

/** Publishing blockers for an order: unstaffed required teams, missing hymns. */
export const RosterAttention = ({ roster }: { roster: OrderRoster }) => {
  if (roster.missingRequiredCount === 0 && roster.missingHymnCount === 0) {
    return null;
  }

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {roster.missingRequiredCount > 0 ? (
        <Badge variant="destructive">
          <WarningCircleIcon />
          {roster.missingRequiredCount}{" "}
          {roster.missingRequiredCount === 1 ? "team needs" : "teams need"}{" "}
          members
        </Badge>
      ) : null}
      {roster.missingHymnCount > 0 ? (
        <Badge variant="destructive">
          <MusicNotesIcon />
          {roster.missingHymnCount}{" "}
          {roster.missingHymnCount === 1 ? "hymn" : "hymns"} to choose
        </Badge>
      ) : null}
    </span>
  );
};

const MemberChip = ({ member }: { member: RosterMember }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-2.5 pl-0.5 text-xs font-medium">
    <Avatar size="sm">
      <AvatarFallback>
        {getInitials(member.firstName, member.lastName)}
      </AvatarFallback>
    </Avatar>
    {formatRosterMemberName(member)}
  </span>
);

const FullTeamRow = ({ team }: { team: RosterTeam }) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium">{teamDisplayName(team)}</span>
      {team.required ? <Badge variant="secondary">Required</Badge> : null}
      <TeamMissingBadge team={team} />
    </div>
    {team.members.length === 0 ? (
      <span className="text-sm text-muted-foreground">No one assigned</span>
    ) : (
      <span className="flex flex-wrap gap-1.5">
        {team.members.map((member) => (
          <MemberChip key={member.id} member={member} />
        ))}
      </span>
    )}
  </div>
);

const CompactTeamLine = ({
  cardName,
  team,
}: {
  cardName?: string;
  team: RosterTeam;
}) => (
  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
    <span className="font-medium">
      {cardName ? `${cardName} — ` : ""}
      {teamDisplayName(team)}
    </span>
    {team.members.length === 0 ? (
      <span className="text-muted-foreground">No one assigned</span>
    ) : (
      <span className="text-muted-foreground">{formatMemberNames(team)}</span>
    )}
    <TeamMissingBadge team={team} />
  </span>
);

/**
 * Who serves where on an order, by name. "full" shows member chips grouped by
 * timeblock; "compact" shows one line per team for list rows.
 */
export const OrderRosterSummary = ({
  roster,
  variant = "full",
}: {
  roster: OrderRoster;
  variant?: "compact" | "full";
}) => {
  if (!roster.hasTeams) {
    return (
      <span className="text-sm text-muted-foreground">
        No teams on this order yet.
      </span>
    );
  }

  if (variant === "compact") {
    const showCardNames = roster.cards.length > 1;

    return (
      <span className="flex flex-col gap-1">
        {roster.cards.flatMap((card) =>
          card.teams.map((team) => (
            <CompactTeamLine
              cardName={showCardNames ? card.cardName : undefined}
              key={`${card.cardId}-${team.teamId}`}
              team={team}
            />
          ))
        )}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {roster.cards.map((card, index) => (
        <div className="flex flex-col gap-2" key={card.cardId}>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {card.cardName}
            {roster.cards.length > 1 ? ` · Timeblock ${index + 1}` : ""}
          </span>
          <div className="flex flex-col gap-3">
            {card.teams.map((team) => (
              <FullTeamRow key={team.teamId} team={team} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

export const OrderStatusBadge = ({
  status,
}: {
  status: OrderOverview["status"];
}) => (
  <Badge variant={status === "Published" ? "default" : "secondary"}>
    {status}
  </Badge>
);

const getServiceDateParts = (serviceDate: string) => {
  const date = new Date(`${serviceDate}T00:00:00.000Z`);
  const format = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...options }).format(
      date
    );

  return {
    dayNumber: format({ day: "numeric" }),
    monthShort: format({ month: "short" }),
    weekdayShort: format({ weekday: "short" }),
  };
};

interface OrderOverviewRowProps {
  badge?: React.ReactNode;
  dimmed?: boolean;
  order: OrderOverview;
}

/**
 * One tappable order row — date, title, and its compact named roster — shared
 * by the dashboard month list and the Month Planner.
 */
export const OrderOverviewRow = ({
  badge,
  dimmed = false,
  order,
}: OrderOverviewRowProps) => {
  const { dayNumber, monthShort, weekdayShort } = getServiceDateParts(
    order.serviceDate
  );

  return (
    <Link
      className={cn(
        "flex items-start gap-4 p-4 transition-colors hover:bg-muted/50",
        dimmed && "opacity-70"
      )}
      params={{ orderId: order.id }}
      to="/orders/$orderId"
    >
      <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border py-2">
        <span className="text-[0.625rem] font-medium text-muted-foreground uppercase">
          {weekdayShort}
        </span>
        <span className="text-xl leading-tight font-semibold tabular-nums">
          {dayNumber}
        </span>
        <span className="text-[0.625rem] text-muted-foreground uppercase">
          {monthShort}
        </span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{order.title}</span>
          {badge}
          <OrderStatusBadge status={order.status} />
          <RosterAttention roster={order.roster} />
        </span>
        <OrderRosterSummary roster={order.roster} variant="compact" />
      </span>
      <ArrowRightIcon className="mt-1 shrink-0 text-muted-foreground" />
    </Link>
  );
};
