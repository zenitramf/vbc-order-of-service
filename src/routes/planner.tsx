// oxlint-disable no-use-before-define
import {
  CalendarPlusIcon,
  CaretLeftIcon,
  CaretRightIcon,
  UsersThreeIcon,
  WarningCircleIcon,
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
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
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
import { filterTeamMembers } from "~/lib/teams-logic";
import { cn } from "~/lib/utils";

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

const isValidMonth = (value: string) => /^\d{4}-\d{2}$/u.test(value);

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

interface MemberPickerDialogProps {
  cardName: string;
  members: TeamMemberSummary[];
  onClose: () => void;
  onToggleMember: (memberId: string, checked: boolean) => void;
  selectedMemberIds: string[];
  teamName: string;
}

const MemberPickerDialog = ({
  cardName,
  members,
  onClose,
  onToggleMember,
  selectedMemberIds,
  teamName,
}: MemberPickerDialogProps) => {
  const [search, setSearch] = React.useState("");
  const visibleMembers = filterTeamMembers(members, search);

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{teamName}</DialogTitle>
          <DialogDescription>
            Add or remove members for {cardName}.
          </DialogDescription>
        </DialogHeader>
        {members.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No members on this team yet. Add members in Team Management.
          </p>
        ) : (
          <>
            <Input
              aria-label="Search members"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
              type="search"
              value={search}
            />
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto">
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
          </>
        )}
        <DialogFooter>
          <Button onClick={onClose} type="button">
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface MonthScheduleDialogProps {
  cards: MonthScheduleCard[];
  onClose: () => void;
  onSaved: () => Promise<void> | void;
  teamId: string;
  teamMembers: TeamMemberSummary[];
  teamName: string;
}

const MonthScheduleDialog = ({
  cards,
  onClose,
  onSaved,
  teamId,
  teamMembers,
  teamName,
}: MonthScheduleDialogProps) => {
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

  const membersById = React.useMemo(
    () => new Map(teamMembers.map((member) => [member.id, member])),
    [teamMembers]
  );

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
      <span className="text-sm">
        {ids
          .map((id) => {
            const member = membersById.get(id);

            return member
              ? `${member.firstName} ${member.lastName}`.trim()
              : "Former member";
          })
          .join(", ")}
      </span>
    );
  };

  const handleSave = async () => {
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
      toast.success(`${teamName} schedule saved.`);
      await onSaved();
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Schedule could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const manageCard = manageKey
    ? cards.find((card) => cardKey(card.orderId, card.cardId) === manageKey)
    : undefined;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      open
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Schedule {teamName}</DialogTitle>
          <DialogDescription>
            Add or modify {teamName} members for every service card in the month
            where the team is required or optional.
          </DialogDescription>
        </DialogHeader>
        {cards.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No planned services in this month staff {teamName}. Plan the month
            first, then assign members here.
          </p>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Service</TableHead>
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
                    <TableRow key={key}>
                      <TableCell className="whitespace-nowrap">
                        {formatServiceDate(card.date)}
                      </TableCell>
                      <TableCell>
                        <Link
                          className="hover:underline"
                          params={{ orderId: card.orderId }}
                          to="/orders/$orderId"
                        >
                          {card.orderTitle}
                        </Link>
                      </TableCell>
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
                          onClick={() => setManageKey(key)}
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
          </div>
        )}
        <DialogFooter>
          <Button onClick={onClose} type="button" variant="outline">
            Cancel
          </Button>
          <Button
            disabled={cards.length === 0 || isSaving}
            onClick={handleSave}
            type="button"
          >
            {isSaving ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>

      {manageCard ? (
        <MemberPickerDialog
          cardName={`${formatServiceDate(manageCard.date)} · ${manageCard.cardName}`}
          members={membersForTeam(memberIdsFor(manageKey ?? ""))}
          onClose={() => setManageKey(null)}
          onToggleMember={(memberId, checked) =>
            toggleMember(manageKey ?? "", memberId, checked)
          }
          selectedMemberIds={memberIdsFor(manageKey ?? "")}
          teamName={teamName}
        />
      ) : null}
    </Dialog>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Month Planner
        </h1>
        <p className="text-muted-foreground">
          Pre-populate a month of services and schedule teams such as ushers and
          counters across the whole month.
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
              <CardTitle className="min-w-44 text-center text-xl">
                {formatMonthLabel(month)}
              </CardTitle>
              <Button
                aria-label="Next month"
                onClick={() => goToMonth(shiftMonth(month, 1))}
                size="icon"
                type="button"
                variant="outline"
              >
                <CaretRightIcon />
              </Button>
              <div className="relative ml-1">
                <Input
                  aria-label="Jump to month"
                  className="w-40"
                  onChange={(event) => {
                    if (isValidMonth(event.target.value)) {
                      goToMonth(event.target.value);
                    }
                  }}
                  type="month"
                  value={month}
                />
              </div>
              {month === getCurrentMonth() ? (
                <Badge variant="secondary">Current month</Badge>
              ) : null}
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
                {scheduleTargets.map((target) => (
                  <Button
                    key={target.teamId}
                    onClick={() => setOpenTeamId(target.teamId)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <UsersThreeIcon data-icon="inline-start" />
                    {target.teamName}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}

          {serviceDates.length === 0 ? (
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
                {serviceDates.map((entry) => (
                  <TableRow key={entry.date}>
                    <TableCell className="whitespace-nowrap font-medium">
                      {formatServiceDate(entry.date)}
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
                      {entry.order ? (
                        <Button asChild size="sm" variant="outline">
                          <Link
                            params={{ orderId: entry.order.id }}
                            to="/orders/$orderId"
                          >
                            Open
                          </Link>
                        </Button>
                      ) : (
                        <span className="text-muted-foreground text-sm">
                          Plan month to create
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {openTeam ? (
        <MonthScheduleDialog
          cards={scheduleCards[openTeam.teamId] ?? []}
          onClose={() => setOpenTeamId(null)}
          onSaved={() => router.invalidate()}
          teamId={openTeam.teamId}
          teamMembers={teamMembers}
          teamName={openTeam.teamName}
        />
      ) : null}
    </div>
  );
};

export const Route = createFileRoute("/planner")({
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
