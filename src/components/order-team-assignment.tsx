import { PlusIcon, TrashIcon, WarningCircleIcon } from "@phosphor-icons/react";
import * as React from "react";

import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { CardDescription, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
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
import type {
  ServiceTypeCard,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";
import {
  addTeamAssignment,
  filterTeamMembers,
  getAssignmentMemberIds,
  getCardTeamIds,
  getInitials,
  getRequiredTeamCount,
  isTeamConfigured,
  isTeamOptional,
  isTeamRequired,
  removeTeamAssignment,
  setAssignmentMemberIds,
} from "~/lib/teams-logic";
import { cn } from "~/lib/utils";

const MAX_VISIBLE_AVATARS = 4;

const requirementBadgeVariant = (
  required: boolean,
  assignedCount: number,
  requiredCount: number
) => {
  if (!required) {
    return "secondary" as const;
  }

  return assignedCount < requiredCount
    ? ("destructive" as const)
    : ("default" as const);
};

const requirementBadgeLabel = (
  required: boolean,
  assignedCount: number,
  requiredCount: number
) =>
  required ? `${assignedCount}/${requiredCount}` : `${assignedCount} assigned`;

const MemberAvatar = ({
  member,
  size = "sm",
}: {
  member: TeamMemberSummary;
  size?: "default" | "sm";
}) => (
  <Avatar size={size}>
    <AvatarFallback>
      {getInitials(member.firstName, member.lastName)}
    </AvatarFallback>
  </Avatar>
);

interface TeamAssignmentRowProps {
  assignedMembers: TeamMemberSummary[];
  onManage: () => void;
  onRemove: () => void;
  optional: boolean;
  removable: boolean;
  required: boolean;
  requiredCount: number;
  teamName: string;
}

const TeamAssignmentRow = ({
  assignedMembers,
  onManage,
  onRemove,
  optional,
  removable,
  required,
  requiredCount,
  teamName,
}: TeamAssignmentRowProps) => {
  const assignedCount = assignedMembers.length;
  const isMissing = required && assignedCount < requiredCount;

  return (
    <TableRow>
      <TableCell>
        <div className="flex items-center gap-2">
          <button
            className="font-medium hover:underline"
            onClick={onManage}
            type="button"
          >
            {teamName}
          </button>
          {required ? <Badge variant="secondary">Required</Badge> : null}
          {optional ? <Badge variant="outline">Optional</Badge> : null}
          {isMissing ? (
            <WarningCircleIcon
              aria-label="Needs a member"
              className="size-4 text-destructive"
            />
          ) : null}
        </div>
      </TableCell>
      <TableCell>
        {assignedCount === 0 ? (
          <span className="text-muted-foreground text-sm">No one assigned</span>
        ) : (
          <AvatarGroup>
            {assignedMembers.slice(0, MAX_VISIBLE_AVATARS).map((member) => (
              <MemberAvatar key={member.id} member={member} />
            ))}
            {assignedCount > MAX_VISIBLE_AVATARS ? (
              <AvatarGroupCount>
                +{assignedCount - MAX_VISIBLE_AVATARS}
              </AvatarGroupCount>
            ) : null}
          </AvatarGroup>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant={requirementBadgeVariant(
            required,
            assignedCount,
            requiredCount
          )}
        >
          {requirementBadgeLabel(required, assignedCount, requiredCount)}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button onClick={onManage} size="sm" type="button" variant="outline">
            Manage
          </Button>
          <Button
            disabled={!removable}
            onClick={onRemove}
            size="sm"
            type="button"
            variant="ghost"
          >
            <TrashIcon data-icon="inline-start" />
            Remove
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

interface TeamMemberDialogProps {
  assignedMemberIds: string[];
  cardName: string;
  members: TeamMemberSummary[];
  onClose: () => void;
  onToggleMember: (memberId: string, checked: boolean) => void;
  required: boolean;
  requiredCount: number;
  teamName: string;
}

const TeamMemberDialog = ({
  assignedMemberIds,
  cardName,
  members,
  onClose,
  onToggleMember,
  required,
  requiredCount,
  teamName,
}: TeamMemberDialogProps) => {
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
          <div className="flex items-center gap-2">
            <DialogTitle>{teamName}</DialogTitle>
            <Badge
              variant={requirementBadgeVariant(
                required,
                assignedMemberIds.length,
                requiredCount
              )}
            >
              {requirementBadgeLabel(
                required,
                assignedMemberIds.length,
                requiredCount
              )}
            </Badge>
          </div>
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
                  const checked = assignedMemberIds.includes(member.id);

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
              {assignedMemberIds.length} selected · {visibleMembers.length} of{" "}
              {members.length} shown
            </p>
          </>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Done</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

interface OrderTeamAssignmentProps {
  onUpdateSegment: (segment: ServiceTypeCard) => void;
  segment: ServiceTypeCard;
  teamMembers: TeamMemberSummary[];
  teams: TeamSummary[];
}

export const OrderTeamAssignment = ({
  onUpdateSegment,
  segment,
  teamMembers,
  teams,
}: OrderTeamAssignmentProps) => {
  const [openTeamId, setOpenTeamId] = React.useState<string | null>(null);

  const hasTeamConfig =
    (segment.requiredTeamIds?.length ?? 0) > 0 ||
    (segment.optionalTeamIds?.length ?? 0) > 0 ||
    (segment.teamAssignments?.length ?? 0) > 0;

  if (!hasTeamConfig) {
    return null;
  }

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const membersById = new Map(teamMembers.map((member) => [member.id, member]));
  const cardTeamIds = getCardTeamIds(segment);
  const shownTeamIds = new Set(cardTeamIds);
  const availableTeams = teams.filter((team) => !shownTeamIds.has(team.id));
  const assignedMembersForTeam = (teamId: string) =>
    getAssignmentMemberIds(segment, teamId)
      .map((memberId) => membersById.get(memberId))
      .filter((member) => member !== undefined);
  // Show current team members plus anyone still assigned who has since left the
  // team, so stale assignments stay visible and can be unchecked.
  const membersForTeam = (teamId: string) => {
    const current = teamMembers.filter((member) =>
      member.teamIds.includes(teamId)
    );
    const currentIds = new Set(current.map((member) => member.id));
    const staleAssigned = assignedMembersForTeam(teamId).filter(
      (member) => !currentIds.has(member.id)
    );

    return [...current, ...staleAssigned];
  };

  const updateTeamAssignments = (
    teamAssignments: ServiceTypeCard["teamAssignments"]
  ) => onUpdateSegment({ ...segment, teamAssignments });

  const handleToggleMember = (
    teamId: string,
    memberId: string,
    checked: boolean
  ) => {
    const current = getAssignmentMemberIds(segment, teamId);
    const nextMemberIds = checked
      ? [...current, memberId]
      : current.filter((id) => id !== memberId);

    updateTeamAssignments(
      setAssignmentMemberIds(segment.teamAssignments, teamId, nextMemberIds)
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <CardTitle className="text-base">Team assignments</CardTitle>
          <CardDescription>
            Choose who serves on each team for this service card. Required teams
            must be staffed before publishing.
          </CardDescription>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={availableTeams.length === 0}
              size="sm"
              type="button"
              variant="secondary"
            >
              <PlusIcon data-icon="inline-start" />
              Add team
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {availableTeams.length === 0 ? (
              <DropdownMenuLabel>All teams added</DropdownMenuLabel>
            ) : (
              <DropdownMenuLabel>Other teams</DropdownMenuLabel>
            )}
            {availableTeams.length === 0
              ? null
              : availableTeams.map((team) => (
                  <DropdownMenuItem
                    key={team.id}
                    onSelect={() =>
                      updateTeamAssignments(
                        addTeamAssignment(segment.teamAssignments, team.id)
                      )
                    }
                  >
                    {team.name}
                  </DropdownMenuItem>
                ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Team</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cardTeamIds.length === 0 ? (
            <TableRow>
              <TableCell className="text-muted-foreground" colSpan={4}>
                No teams added yet. Use “Add team” to staff this card.
              </TableCell>
            </TableRow>
          ) : (
            cardTeamIds.map((teamId) => (
              <TeamAssignmentRow
                assignedMembers={assignedMembersForTeam(teamId)}
                key={teamId}
                onManage={() => setOpenTeamId(teamId)}
                onRemove={() =>
                  updateTeamAssignments(
                    removeTeamAssignment(segment.teamAssignments, teamId)
                  )
                }
                optional={isTeamOptional(segment, teamId)}
                removable={!isTeamConfigured(segment, teamId)}
                required={isTeamRequired(segment, teamId)}
                requiredCount={getRequiredTeamCount(segment, teamId)}
                teamName={teamsById.get(teamId)?.name ?? teamId}
              />
            ))
          )}
        </TableBody>
      </Table>

      {openTeamId ? (
        <TeamMemberDialog
          assignedMemberIds={getAssignmentMemberIds(segment, openTeamId)}
          cardName={segment.typeName}
          members={membersForTeam(openTeamId)}
          onClose={() => setOpenTeamId(null)}
          onToggleMember={(memberId, checked) =>
            handleToggleMember(openTeamId, memberId, checked)
          }
          required={isTeamRequired(segment, openTeamId)}
          requiredCount={getRequiredTeamCount(segment, openTeamId)}
          teamName={teamsById.get(openTeamId)?.name ?? openTeamId}
        />
      ) : null}
    </div>
  );
};
