// oxlint-disable no-use-before-define
import {
  CalendarBlankIcon,
  CalendarPlusIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  DotsThreeVerticalIcon,
  UsersThreeIcon,
  WarningCircleIcon,
  XIcon,
} from "@phosphor-icons/react";
import {
  Link,
  createFileRoute,
  useNavigate,
  useRouter,
} from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  getMonthPlan,
  planMonth,
  saveMonthSchedule,
} from "~/lib/order-service-data";
import type {
  MonthScheduleCard,
  TeamMemberSummary,
} from "~/lib/order-service-types";
import { requirePermission } from "~/lib/route-guards";
import { filterTeamMembers, getInitials } from "~/lib/teams-logic";
import { cn } from "~/lib/utils";

const MAX_VISIBLE_AVATARS = 4;

const MemberAvatar = ({ member }: { member: TeamMemberSummary }) => (
  <Avatar size="sm">
    <AvatarFallback>
      {getInitials(member.firstName, member.lastName)}
    </AvatarFallback>
  </Avatar>
);

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const getCurrentMonth = () => new Date().toISOString().slice(0, 7);

const getTodayDate = () => new Date().toISOString().slice(0, 10);

/**
 * First service on/after today is "next"; the one after that is "upcoming".
 * Expects ascending YYYY-MM-DD dates (as produced by getMonthDatesForDayConfigs).
 */
const getTimelineDates = (
  dates: string[]
): { nextDate?: string; upcomingDate?: string } => {
  const today = getTodayDate();
  const upcoming = dates.filter((date) => date >= today);

  return {
    ...(upcoming[0] ? { nextDate: upcoming[0] } : {}),
    ...(upcoming[1] ? { upcomingDate: upcoming[1] } : {}),
  };
};

const isValidMonth = (value: string) =>
  /^\d{4}-(?<month>0[1-9]|1[0-2])$/u.test(value);

/** Shift a YYYY-MM month by the given number of months. */
const shiftMonth = (month: string, delta: number): string => {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));

  return date.toISOString().slice(0, 7);
};

const formatMonthLabel = (month: string): string => {
  const [year, monthNumber] = month.split("-").map(Number);

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, monthNumber - 1, 1)));
};

const formatServiceDate = (date: string): string =>
  new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    weekday: "short",
  }).format(new Date(`${date}T00:00:00.000Z`));

const cardKey = (orderId: string, cardId: string) => `${orderId}::${cardId}`;

interface MemberPickerPaneProps {
  members: TeamMemberSummary[];
  onToggleMember: (memberId: string, checked: boolean) => void;
  selectedMemberIds: string[];
}

const MemberPickerPane = ({
  members,
  onToggleMember,
  selectedMemberIds,
}: MemberPickerPaneProps) => {
  const [search, setSearch] = React.useState("");
  const visibleMembers = filterTeamMembers(members, search);

  if (members.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No members on this team yet. Add members in Team Management.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Input
        aria-label="Search members"
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search by name or email"
        type="search"
        value={search}
      />
      <div className="flex flex-col gap-2">
        {visibleMembers.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No members match “{search}”.
          </p>
        ) : (
          visibleMembers.map((member) => {
            const checked = selectedMemberIds.includes(member.id);

            return (
              <Label
                className={cn(
                  "flex items-center gap-3 rounded-xl border p-2 font-normal",
                  checked && "border-primary bg-primary/5"
                )}
                key={member.id}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) =>
                    onToggleMember(member.id, value === true)
                  }
                />
                <MemberAvatar member={member} />
                <span className="flex flex-col">
                  <span className="text-sm">
                    {member.firstName} {member.lastName}
                  </span>
                  {member.email ? (
                    <span className="text-muted-foreground text-xs">
                      {member.email}
                    </span>
                  ) : null}
                </span>
              </Label>
            );
          })
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {selectedMemberIds.length} selected · {visibleMembers.length} of{" "}
        {members.length} shown
      </p>
    </div>
  );
};

interface ScheduleDateGroupProps {
  cards: MonthScheduleCard[];
  date: string;
  memberIdsFor: (key: string) => string[];
  onManage: (key: string) => void;
  renderAssigned: (key: string) => React.ReactNode;
}

const ScheduleDateGroup = ({
  cards,
  date,
  memberIdsFor,
  onManage,
  renderAssigned,
}: ScheduleDateGroupProps) => {
  const needsAssignment = cards.some(
    (card) =>
      card.required &&
      memberIdsFor(cardKey(card.orderId, card.cardId)).length <
        card.requiredCount
  );
  const [open, setOpen] = React.useState(false);

  return (
    <Collapsible
      className="rounded-lg border"
      onOpenChange={setOpen}
      open={open}
    >
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-3 p-3 text-left">
        <span className="flex items-center gap-2 font-medium">
          <CaretRightIcon
            className={cn("size-4 transition-transform", open && "rotate-90")}
          />
          {formatServiceDate(date)}
        </span>
        {needsAssignment ? (
          <Badge variant="destructive">
            <WarningCircleIcon />
            Needs assignment
          </Badge>
        ) : (
          <Badge variant="secondary">
            <CheckCircleIcon />
            All assigned
          </Badge>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Card</TableHead>
              <TableHead>Assigned members</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cards.map((card) => {
              const key = cardKey(card.orderId, card.cardId);
              const assignedCount = memberIdsFor(key).length;
              const isMissing =
                card.required && assignedCount < card.requiredCount;

              return (
                <TableRow
                  className="cursor-pointer"
                  key={key}
                  onClick={() => onManage(key)}
                >
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {card.cardName}
                      {card.required ? (
                        <Badge variant="secondary">Required</Badge>
                      ) : (
                        <Badge variant="outline">Optional</Badge>
                      )}
                      {isMissing ? (
                        <WarningCircleIcon
                          aria-label="Needs a member"
                          className="size-4 text-destructive"
                        />
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>{renderAssigned(key)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      onClick={(event) => {
                        event.stopPropagation();
                        onManage(key);
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      Manage
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CollapsibleContent>
    </Collapsible>
  );
};

interface MonthSchedulePanelProps {
  cards: MonthScheduleCard[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  teamId: string;
  teamMembers: TeamMemberSummary[];
  teamName: string;
}

const MonthSchedulePanel = ({
  cards,
  onClose,
  onSaved,
  teamId,
  teamMembers,
  teamName,
}: MonthSchedulePanelProps) => {
  const saveSchedule = useServerFn(saveMonthSchedule);
  const [assignments, setAssignments] = React.useState<Map<string, string[]>>(
    () =>
      new Map(
        cards.map((card) => [
          cardKey(card.orderId, card.cardId),
          card.memberIds,
        ])
      )
  );
  const [manageKey, setManageKey] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const dirtyRef = React.useRef(false);

  const membersById = React.useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member])),
    [teamMembers]
  );

  // Group the team's staffable cards by date for the collapsible day sections.
  const cardsByDate = React.useMemo(() => {
    const byDate = new Map<string, MonthScheduleCard[]>();

    for (const card of cards) {
      const list = byDate.get(card.date) ?? [];
      list.push(card);
      byDate.set(card.date, list);
    }

    // oxlint-disable-next-line unicorn/no-array-sort -- ES2022 target does not include toSorted.
    return [...byDate.entries()].sort((first, second) =>
      first[0].localeCompare(second[0])
    );
  }, [cards]);

  const memberIdsFor = (key: string) => assignments.get(key) ?? [];

  const membersForTeam = (selectedIds: string[]) => {
    const current = teamMembers.filter((member) =>
      member.teamIds.includes(teamId)
    );
    const currentIds = new Set(current.map((member) => member.id));
    const stale = selectedIds
      .filter((id) => !currentIds.has(id))
      .map((id) => membersById.get(id))
      .filter((member): member is TeamMemberSummary => member !== undefined);

    return [...current, ...stale];
  };

  const toggleMember = (key: string, memberId: string, checked: boolean) => {
    dirtyRef.current = true;
    setAssignments((current) => {
      const next = new Map(current);
      const existing = next.get(key) ?? [];
      next.set(
        key,
        checked
          ? [...existing, memberId]
          : existing.filter((id) => id !== memberId)
      );

      return next;
    });
  };

  const renderAssigned = (key: string) => {
    const ids = memberIdsFor(key);

    if (ids.length === 0) {
      return (
        <span className="text-muted-foreground text-sm">No one assigned</span>
      );
    }

    return (
      <AvatarGroup>
        {ids.slice(0, MAX_VISIBLE_AVATARS).map((id) => {
          const member = membersById.get(id);

          return member ? (
            <MemberAvatar key={id} member={member} />
          ) : (
            <Avatar key={id} size="sm">
              <AvatarFallback>?</AvatarFallback>
            </Avatar>
          );
        })}
        {ids.length > MAX_VISIBLE_AVATARS ? (
          <AvatarGroupCount>
            +{ids.length - MAX_VISIBLE_AVATARS}
          </AvatarGroupCount>
        ) : null}
      </AvatarGroup>
    );
  };

  // Persist the whole team schedule. Selections save automatically when the
  // member picker closes or the sheet is dismissed, so there is no explicit
  // save button. The dirty guard avoids redundant writes when nothing changed.
  const persist = async () => {
    if (!dirtyRef.current) {
      return;
    }

    setIsSaving(true);

    try {
      await saveSchedule({
        data: {
          assignments: cards.map((card) => ({
            cardId: card.cardId,
            memberIds: memberIdsFor(cardKey(card.orderId, card.cardId)),
            orderId: card.orderId,
          })),
          teamId,
        },
      });
      dirtyRef.current = false;
      toast.success(`${teamName} schedule saved.`);
      await onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Schedule could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const closePicker = async () => {
    setManageKey(null);
    await persist();
  };

  const manageCard = manageKey
    ? cards.find((card) => cardKey(card.orderId, card.cardId) === manageKey)
    : undefined;

  const renderScheduleList = () => {
    if (cardsByDate.length === 0) {
      return (
        <p className="text-muted-foreground text-sm">
          No planned services in this month staff {teamName}. Plan the month
          first, then assign members here.
        </p>
      );
    }

    return (
      <div className="flex flex-col gap-2">
        {cardsByDate.map(([date, dateCards]) => (
          <ScheduleDateGroup
            cards={dateCards}
            date={date}
            key={date}
            memberIdsFor={memberIdsFor}
            onManage={setManageKey}
            renderAssigned={renderAssigned}
          />
        ))}
      </div>
    );
  };

  const exitScheduling = async () => {
    await persist();
    onClose();
  };

  return (
    <div className="flex flex-col overflow-hidden rounded-lg border-2 border-primary bg-primary/5">
      <div className="flex flex-col gap-3 border-b bg-primary/10 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-2 font-medium text-primary text-sm">
              <UsersThreeIcon className="size-4" />
              Scheduling mode
            </span>
            {manageCard ? (
              <>
                <p className="font-heading font-semibold text-lg">{teamName}</p>
                <p className="text-muted-foreground text-sm">
                  Add or remove members for {formatServiceDate(manageCard.date)}{" "}
                  · {manageCard.cardName}.
                </p>
              </>
            ) : (
              <>
                <p className="font-heading font-semibold text-lg">
                  Schedule {teamName}
                </p>
                <p className="text-muted-foreground text-sm">
                  Add or modify {teamName} members for every service card where
                  the team is required or optional. Changes save automatically.
                </p>
              </>
            )}
          </div>
          <Button
            disabled={isSaving}
            onClick={exitScheduling}
            size="sm"
            type="button"
            variant="outline"
          >
            <XIcon data-icon="inline-start" />
            Exit scheduling
          </Button>
        </div>
        {manageCard ? (
          <button
            className="flex w-fit items-center gap-1 text-muted-foreground text-sm hover:text-foreground"
            onClick={closePicker}
            type="button"
          >
            <CaretLeftIcon className="size-4" />
            Back to schedule
          </button>
        ) : null}
      </div>

      <div className="bg-background p-4">
        {manageCard ? (
          <MemberPickerPane
            members={membersForTeam(memberIdsFor(manageKey ?? ""))}
            onToggleMember={(memberId, checked) =>
              toggleMember(manageKey ?? "", memberId, checked)
            }
            selectedMemberIds={memberIdsFor(manageKey ?? "")}
          />
        ) : (
          renderScheduleList()
        )}
      </div>

      <div className="flex items-center justify-between border-t bg-primary/10 px-4 py-3">
        <span className="text-muted-foreground text-xs">
          {isSaving ? "Saving…" : "Changes save automatically"}
        </span>
        {manageCard ? (
          <Button disabled={isSaving} onClick={closePicker} type="button">
            Done
          </Button>
        ) : null}
      </div>
    </div>
  );
};

const MonthPlannerPage = () => {
  const {
    missingCount,
    month,
    scheduleCards,
    scheduleTargets,
    serviceDates,
    teamMembers,
    unconfiguredWeekdays,
  } = Route.useLoaderData();
  const navigate = useNavigate();
  const router = useRouter();
  const planMonthFn = useServerFn(planMonth);
  const [isPlanning, setIsPlanning] = React.useState(false);
  const [openTeamId, setOpenTeamId] = React.useState<string | null>(null);

  const goToMonth = (next: string) => {
    void navigate({ search: { month: next }, to: "/planner" });
  };

  // Snapshot today with the badge dates so a midnight rollover cannot leave a
  // row both dimmed and labelled "Next". Only badge the current month — other
  // months lack intervening dates, so labeling their first rows would mislead.
  const { nextDate, todayDate, upcomingDate } = React.useMemo(() => {
    const today = getTodayDate();

    if (month !== getCurrentMonth()) {
      return { todayDate: today };
    }

    return {
      todayDate: today,
      ...getTimelineDates(serviceDates.map((entry) => entry.date)),
    };
  }, [month, serviceDates]);

  const openOrder = (orderId: string) => {
    void navigate({ params: { orderId }, to: "/orders/$orderId" });
  };

  const handlePlanMonth = async () => {
    setIsPlanning(true);

    try {
      const result = await planMonthFn({ data: { month } });
      toast.success(
        result.createdCount === 0
          ? "All configured services already exist."
          : `Planned ${result.createdCount} service(s) for ${formatMonthLabel(month)}.`
      );
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to plan this month."
      );
    } finally {
      setIsPlanning(false);
    }
  };

  const openTeam = openTeamId
    ? scheduleTargets.find((target) => target.teamId === openTeamId)
    : undefined;

  const plannedServices =
    serviceDates.length === 0 ? (
      <p className="text-muted-foreground text-sm">
        No weekdays are configured for pre-population.{" "}
        <Link className="underline" to="/settings">
          Configure the Month Planner
        </Link>{" "}
        to choose which days to plan.
      </p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {serviceDates.map((entry) => {
            const hasOrder = Boolean(entry.order);
            const isNext = entry.date === nextDate;
            const isUpcoming = entry.date === upcomingDate;
            const isPast = entry.date < todayDate;

            return (
              <TableRow
                className={cn(
                  hasOrder && "cursor-pointer",
                  isPast && "opacity-70"
                )}
                key={entry.date}
                onClick={() => {
                  if (entry.order) {
                    openOrder(entry.order.id);
                  }
                }}
              >
                <TableCell className="whitespace-nowrap font-medium">
                  <span className="inline-flex items-center gap-2">
                    {formatServiceDate(entry.date)}
                    {isNext ? <Badge>Next</Badge> : null}
                    {isUpcoming ? (
                      <Badge variant="secondary">Upcoming</Badge>
                    ) : null}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {entry.templateName || "Template missing"}
                  </Badge>
                </TableCell>
                <TableCell>
                  {entry.order ? (
                    <Badge
                      variant={
                        entry.order.status === "Published"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {entry.order.status}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Not planned</Badge>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {hasOrder ? (
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            aria-label="Service actions"
                            onClick={(event) => event.stopPropagation()}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <DotsThreeVerticalIcon />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => openOrder(entry.order?.id ?? "")}
                          >
                            Manage
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">
                      Plan month to create
                    </span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Month Planner
        </h1>
        <p className="text-muted-foreground">
          Create and review upcoming services for the month, then assign teams
          to each service card.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <Button
                aria-label="Previous month"
                onClick={() => goToMonth(shiftMonth(month, -1))}
                size="icon"
                type="button"
                variant="outline"
              >
                <CaretLeftIcon />
              </Button>
              <div className="flex min-w-44 items-center justify-center text-center">
                <CardTitle className="text-xl">
                  {formatMonthLabel(month)}
                </CardTitle>
              </div>
              <Button
                aria-label="Next month"
                onClick={() => goToMonth(shiftMonth(month, 1))}
                size="icon"
                type="button"
                variant="outline"
              >
                <CaretRightIcon />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    aria-label="Jump to month"
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <CalendarBlankIcon />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-3">
                  <Input
                    aria-label="Jump to month"
                    onChange={(event) => {
                      if (isValidMonth(event.target.value)) {
                        goToMonth(event.target.value);
                      }
                    }}
                    type="month"
                    value={month}
                  />
                </PopoverContent>
              </Popover>
              {month === getCurrentMonth() ? null : (
                <Button
                  onClick={() => goToMonth(getCurrentMonth())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Today
                </Button>
              )}
            </div>
            {missingCount > 0 ? (
              <Button
                disabled={isPlanning}
                onClick={handlePlanMonth}
                type="button"
              >
                <CalendarPlusIcon data-icon="inline-start" />
                {isPlanning
                  ? "Planning…"
                  : `Plan month (${missingCount} missing)`}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {unconfiguredWeekdays.length > 0 ? (
            <Alert variant="destructive">
              <WarningCircleIcon />
              <AlertTitle>Month Planner settings need a template</AlertTitle>
              <AlertDescription>
                <span>
                  {unconfiguredWeekdays
                    .map((weekday) => WEEKDAY_NAMES[weekday])
                    .join(", ")}{" "}
                  {unconfiguredWeekdays.length === 1 ? "is" : "are"} enabled
                  without a valid template.{" "}
                  <Link className="underline" to="/settings">
                    Update Month Planner settings
                  </Link>{" "}
                  before planning.
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {scheduleTargets.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="font-medium text-sm">Schedule a team</p>
              <div className="flex flex-wrap gap-2">
                {scheduleTargets.map((target) => {
                  const isActive = openTeamId === target.teamId;

                  return (
                    <Button
                      key={target.teamId}
                      onClick={() =>
                        setOpenTeamId(isActive ? null : target.teamId)
                      }
                      size="sm"
                      type="button"
                      variant={isActive ? "default" : "secondary"}
                    >
                      <UsersThreeIcon data-icon="inline-start" />
                      {target.teamName}
                    </Button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {openTeam ? (
            <MonthSchedulePanel
              cards={scheduleCards[openTeam.teamId] ?? []}
              key={openTeam.teamId}
              onClose={() => setOpenTeamId(null)}
              onSaved={() => router.invalidate()}
              teamId={openTeam.teamId}
              teamMembers={teamMembers}
              teamName={openTeam.teamName}
            />
          ) : (
            plannedServices
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/planner")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "orders", "view");
  },
  component: MonthPlannerPage,
  loader: ({ deps }) => getMonthPlan({ data: deps.month ?? "" }),
  loaderDeps: ({ search }: { search: { month?: string } }) => ({
    month: search.month,
  }),
  validateSearch: (search: Record<string, unknown>): { month?: string } => ({
    month:
      typeof search.month === "string" && isValidMonth(search.month)
        ? search.month
        : undefined,
  }),
});
