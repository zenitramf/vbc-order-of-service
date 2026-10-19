// oxlint-disable no-use-before-define
import {
  ArrowRightIcon,
  MusicNotesIcon,
  PlusIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { TeamMemberDialog } from "~/components/order-team-assignment";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import type {
  OrderOverview,
  OrderRoster,
  RosterCard,
  RosterMember,
  RosterTeam,
  TeamMemberSummary,
} from "~/lib/order-service-types";
import { getInitials } from "~/lib/teams-logic";
import { cn } from "~/lib/utils";

const MAX_COMPACT_MEMBERS = 4;

/** Stable per-person avatar tint so the same face reads the same everywhere. */
const MEMBER_TONES = [
  "bg-chart-1/20 text-chart-1",
  "bg-chart-2/20 text-chart-2",
  "bg-chart-3/20 text-chart-3",
  "bg-chart-4/20 text-chart-4",
  "bg-chart-5/20 text-chart-5",
] as const;

const memberTone = (member: RosterMember): string => {
  const name = formatRosterMemberName(member);
  let hash = 0;

  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + (name.codePointAt(index) ?? 0)) % 9973;
  }

  return MEMBER_TONES[hash % MEMBER_TONES.length];
};

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
    <Badge variant="warning">
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
        <Badge variant="warning">
          <WarningCircleIcon />
          {roster.missingRequiredCount}{" "}
          {roster.missingRequiredCount === 1 ? "team needs" : "teams need"}{" "}
          members
        </Badge>
      ) : null}
      {roster.missingHymnCount > 0 ? (
        <Badge variant="info">
          <MusicNotesIcon />
          {roster.missingHymnCount}{" "}
          {roster.missingHymnCount === 1 ? "hymn" : "hymns"} to choose
        </Badge>
      ) : null}
    </span>
  );
};

/**
 * Inline people editing for the full roster: add through the picker, remove
 * from a chip. Absent on read-only surfaces (dashboard, month planner).
 */
export interface RosterEditing {
  onToggleMember: (
    cardId: string,
    teamId: string,
    memberId: string,
    assigned: boolean
  ) => void;
  teamMembers: TeamMemberSummary[];
}

/** Current team members plus stale assignees, for the picker. */
const assignableMembers = (
  editing: RosterEditing,
  team: RosterTeam
): TeamMemberSummary[] => {
  const current = editing.teamMembers.filter((member) =>
    member.teamIds.includes(team.teamId)
  );
  const currentIds = new Set(current.map((member) => member.id));
  const membersById = new Map(
    editing.teamMembers.map((member) => [member.id, member])
  );
  const staleAssigned = team.members
    .map((member) => membersById.get(member.id))
    .filter(
      (member): member is TeamMemberSummary =>
        member !== undefined && !currentIds.has(member.id)
    );

  return [...current, ...staleAssigned];
};

const MemberChip = ({
  member,
  onRemove,
  teamName,
}: {
  member: RosterMember;
  onRemove?: () => void;
  teamName?: string;
}) => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pl-0.5 text-xs font-medium",
      onRemove ? "pr-0.5" : "pr-2.5"
    )}
  >
    <Avatar size="sm">
      <AvatarFallback className={memberTone(member)}>
        {getInitials(member.firstName, member.lastName)}
      </AvatarFallback>
    </Avatar>
    {formatRosterMemberName(member)}
    {onRemove ? (
      <Button
        aria-label={`Remove ${formatRosterMemberName(member)} from ${teamName ?? "this team"}`}
        className="rounded-full"
        onClick={onRemove}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <XIcon />
      </Button>
    ) : null}
  </span>
);

const FullTeamRow = ({
  cardId,
  editing,
  onAddPerson,
  team,
}: {
  cardId: string;
  editing?: RosterEditing;
  onAddPerson?: () => void;
  team: RosterTeam;
}) => (
  <div className="flex flex-col gap-2 rounded-lg bg-muted/30 px-3 py-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <span className="break-all text-sm font-medium sm:break-normal">
        {teamDisplayName(team)}
      </span>
      {team.required ? <Badge variant="secondary">Required</Badge> : null}
      <TeamMissingBadge team={team} />
    </div>
    <span className="flex flex-wrap items-center gap-1.5">
      {team.members.length === 0 ? (
        <span className="text-sm text-muted-foreground">No one assigned</span>
      ) : (
        team.members.map((member) => (
          <MemberChip
            key={member.id}
            member={member}
            onRemove={
              editing
                ? () =>
                    editing.onToggleMember(
                      cardId,
                      team.teamId,
                      member.id,
                      false
                    )
                : undefined
            }
            teamName={teamDisplayName(team)}
          />
        ))
      )}
      {editing ? (
        <Button onClick={onAddPerson} size="sm" type="button" variant="outline">
          <PlusIcon data-icon="inline-start" />
          Add person
        </Button>
      ) : null}
    </span>
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
  editing,
  roster,
  variant = "full",
}: {
  editing?: RosterEditing;
  roster: OrderRoster;
  variant?: "compact" | "full";
}) => {
  const [picker, setPicker] = React.useState<{
    card: RosterCard;
    team: RosterTeam;
  } | null>(null);

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

  // Resolve the picker against the live roster so checkboxes reflect toggles
  // made while it is open, even though `picker` holds a stale snapshot.
  const pickerCard = picker
    ? roster.cards.find((card) => card.cardId === picker.card.cardId)
    : undefined;
  const pickerTeam = pickerCard?.teams.find(
    (team) => team.teamId === picker?.team.teamId
  );

  return (
    <div className="flex flex-col gap-6">
      {roster.cards.map((card, index) => (
        <div className="flex flex-col gap-3" key={card.cardId}>
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {card.cardName}
            {roster.cards.length > 1 ? ` · Timeblock ${index + 1}` : ""}
          </span>
          <div className="flex flex-col gap-2">
            {card.teams.map((team) => (
              <FullTeamRow
                cardId={card.cardId}
                editing={editing}
                key={team.teamId}
                onAddPerson={() => setPicker({ card, team })}
                team={team}
              />
            ))}
          </div>
        </div>
      ))}
      {editing && pickerCard && pickerTeam ? (
        <TeamMemberDialog
          assignedMemberIds={pickerTeam.members.map((member) => member.id)}
          cardName={pickerCard.cardName}
          key={`${pickerCard.cardId}-${pickerTeam.teamId}`}
          members={assignableMembers(editing, pickerTeam)}
          onClose={() => setPicker(null)}
          onToggleMember={(memberId, checked) =>
            editing.onToggleMember(
              pickerCard.cardId,
              pickerTeam.teamId,
              memberId,
              checked
            )
          }
          required={pickerTeam.required}
          requiredCount={pickerTeam.requiredCount}
          teamName={teamDisplayName(pickerTeam)}
        />
      ) : null}
    </div>
  );
};

export const OrderStatusBadge = ({
  status,
}: {
  status: OrderOverview["status"];
}) => (
  <Badge variant={status === "Published" ? "success" : "warning"}>
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
  /** Solid teal date tile — use for the next upcoming service. */
  highlighted?: boolean;
  order: OrderOverview;
}

/**
 * One tappable order row — date, title, and its compact named roster — shared
 * by the dashboard month list and the Month Planner.
 */
export const OrderOverviewRow = ({
  badge,
  dimmed = false,
  highlighted = false,
  order,
}: OrderOverviewRowProps) => {
  const { dayNumber, monthShort, weekdayShort } = getServiceDateParts(
    order.serviceDate
  );

  return (
    <Link
      className={cn(
        "flex items-start gap-4 p-4 transition-colors hover:bg-accent/50",
        dimmed && "opacity-70"
      )}
      params={{ orderId: order.id }}
      to="/orders/$orderId"
    >
      <span
        className={cn(
          "flex w-12 shrink-0 flex-col items-center rounded-lg border py-2",
          highlighted
            ? "border-primary bg-primary text-primary-foreground"
            : "border-primary/25 bg-primary/8 text-primary"
        )}
      >
        <span className="text-[0.625rem] font-medium uppercase opacity-80">
          {weekdayShort}
        </span>
        <span className="text-xl leading-tight font-semibold tabular-nums">
          {dayNumber}
        </span>
        <span className="text-[0.625rem] uppercase opacity-80">
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
