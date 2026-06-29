// oxlint-disable no-use-before-define
import {
  FloppyDiskIcon,
  ListChecksIcon,
  PlusIcon,
  TrashIcon,
  UserPlusIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

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
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import {
  addMemberToTeam,
  removeMemberFromTeam,
  saveTeam,
} from "~/lib/order-service-data";
import type {
  TeamMemberSummary,
  TeamRecord,
  TeamSummary,
  TemplateOption,
} from "~/lib/order-service-types";

interface TeamEditorPageProps {
  allMembers: TeamMemberSummary[];
  allTeams: TeamSummary[];
  team?: TeamRecord;
  templates: TemplateOption[];
}

const NONE_PARENT_VALUE = "none";

export const TeamEditorPage = ({
  allMembers,
  allTeams,
  team,
  templates,
}: TeamEditorPageProps) => {
  const navigate = useNavigate();
  const router = useRouter();
  const saveTeamFn = useServerFn(saveTeam);
  const addMemberToTeamFn = useServerFn(addMemberToTeam);
  const removeMemberFromTeamFn = useServerFn(removeMemberFromTeam);

  const [name, setName] = React.useState(team?.name ?? "");
  const [parentTeamId, setParentTeamId] = React.useState(
    team?.parentTeamId ?? NONE_PARENT_VALUE
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [memberToAdd, setMemberToAdd] = React.useState("");
  const [isUpdatingMembers, setIsUpdatingMembers] = React.useState(false);

  const members = team?.members ?? [];
  const memberIdsInTeam = new Set(members.map((member) => member.id));
  const availableMembers = allMembers.filter(
    (member) => !memberIdsInTeam.has(member.id)
  );
  // A team cannot be its own parent, and (to keep the tree shallow) only
  // top-level teams are offered as parents.
  const parentOptions = allTeams.filter(
    (candidate) => candidate.id !== team?.id && !candidate.parentTeamId
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const result = await saveTeamFn({
        data: {
          id: team?.id,
          name,
          parentTeamId:
            parentTeamId === NONE_PARENT_VALUE ? undefined : parentTeamId,
        },
      });
      await navigate({ params: { teamId: result.id }, to: "/teams/$teamId" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save team."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!(team?.id && memberToAdd)) {
      return;
    }

    setIsUpdatingMembers(true);

    try {
      await addMemberToTeamFn({
        data: { memberId: memberToAdd, teamId: team.id },
      });
      setMemberToAdd("");
      await router.invalidate();
      toast.success("Member added to team.");
    } catch {
      toast.error("Unable to add member. Please try again.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!team?.id) {
      return;
    }

    setIsUpdatingMembers(true);

    try {
      await removeMemberFromTeamFn({ data: { memberId, teamId: team.id } });
      await router.invalidate();
      toast.success(`Removed ${memberName} from this team.`);
    } catch {
      toast.error("Unable to remove member. Please try again.");
    } finally {
      setIsUpdatingMembers(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {team ? "Edit Team" : "New Team"}
          </h1>
          <p className="text-muted-foreground">
            Name the team, set an optional parent team, and manage its members.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? "Saving…" : "Save team"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Team details</CardTitle>
            <CardDescription>
              Sub-teams (for example Counters under Ushers) share their parent
              team for reporting.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="team-name">Team name</FieldLabel>
                <Input
                  id="team-name"
                  onChange={(event) => setName(event.target.value)}
                  required
                  value={name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="team-parent">Parent team</FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="team-parent"
                  onChange={(event) => setParentTeamId(event.target.value)}
                  value={parentTeamId}
                >
                  <NativeSelectOption value={NONE_PARENT_VALUE}>
                    None (top-level team)
                  </NativeSelectOption>
                  {parentOptions.map((option) => (
                    <NativeSelectOption key={option.id} value={option.id}>
                      {option.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldDescription>
                  Choose a parent to make this a sub-team, e.g. Counters within
                  Ushers.
                </FieldDescription>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Associated templates</CardTitle>
              <CardDescription>
                Templates that require or allow this team on a service card.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {templates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No templates reference this team yet.
                </p>
              ) : (
                templates.map((template) => (
                  <Button
                    asChild
                    className="justify-start"
                    key={template.id}
                    variant="outline"
                  >
                    <Link
                      params={{ templateId: template.id }}
                      to="/templates/$templateId"
                    >
                      <ListChecksIcon data-icon="inline-start" />
                      {template.name}
                    </Link>
                  </Button>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <CardTitle>Team members</CardTitle>
              <CardDescription>
                Add existing people to this team, or create a new member
                profile.
              </CardDescription>
            </div>
            {team?.id ? (
              <div className="flex flex-wrap items-end gap-2">
                <NativeSelect
                  aria-label="Select a member to add"
                  className="min-w-56"
                  disabled={availableMembers.length === 0 || isUpdatingMembers}
                  onChange={(event) => setMemberToAdd(event.target.value)}
                  value={memberToAdd}
                >
                  <NativeSelectOption value="">
                    {availableMembers.length === 0
                      ? "All members on this team"
                      : "Choose a member…"}
                  </NativeSelectOption>
                  {availableMembers.map((member) => (
                    <NativeSelectOption key={member.id} value={member.id}>
                      {member.firstName} {member.lastName}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <Button
                  disabled={!memberToAdd || isUpdatingMembers}
                  onClick={handleAddMember}
                  type="button"
                  variant="secondary"
                >
                  <UserPlusIcon data-icon="inline-start" />
                  Add member
                </Button>
                <Button asChild type="button" variant="outline">
                  <Link search={{ teamId: team.id }} to="/members/new">
                    <PlusIcon data-icon="inline-start" />
                    New member
                  </Link>
                </Button>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent>
          {team?.id ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Other teams</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={5}>
                      No members on this team yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell>
                        <Link
                          className="font-medium hover:underline"
                          params={{ memberId: member.id }}
                          to="/members/$memberId"
                        >
                          {member.firstName} {member.lastName}
                        </Link>
                      </TableCell>
                      <TableCell>{member.email || "—"}</TableCell>
                      <TableCell>{member.phone || "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.teamNames
                            .filter((teamName) => teamName !== team.name)
                            .map((teamName) => (
                              <Badge key={teamName} variant="secondary">
                                {teamName}
                              </Badge>
                            ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          disabled={isUpdatingMembers}
                          onClick={() =>
                            void handleRemoveMember(
                              member.id,
                              `${member.firstName} ${member.lastName}`
                            )
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <TrashIcon data-icon="inline-start" />
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>Save the team first</EmptyTitle>
                <EmptyDescription>
                  Once the team is saved you can add and remove members.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CardContent>
      </Card>
    </form>
  );
};
