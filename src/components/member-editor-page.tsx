// oxlint-disable no-use-before-define
import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { saveTeamMember } from "~/lib/order-service-data";
import type { TeamMember, TeamSummary } from "~/lib/order-service-types";
import { buildTeamTree, validateTeamMember } from "~/lib/teams-logic";

interface MemberEditorPageProps {
  allTeams: TeamSummary[];
  initialTeamIds?: string[];
  member?: TeamMember;
}

const EMPTY_TEAM_IDS: string[] = [];

export const MemberEditorPage = ({
  allTeams,
  initialTeamIds = EMPTY_TEAM_IDS,
  member,
}: MemberEditorPageProps) => {
  const navigate = useNavigate();
  const saveTeamMemberFn = useServerFn(saveTeamMember);

  const [firstName, setFirstName] = React.useState(member?.firstName ?? "");
  const [lastName, setLastName] = React.useState(member?.lastName ?? "");
  const [email, setEmail] = React.useState(member?.email ?? "");
  const [phone, setPhone] = React.useState(member?.phone ?? "");
  const [notes, setNotes] = React.useState(member?.notes ?? "");
  const [teamIds, setTeamIds] = React.useState<string[]>(
    member?.teamIds ?? initialTeamIds
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const teamTree = React.useMemo(() => buildTeamTree(allTeams), [allTeams]);

  const toggleTeam = (teamId: string, checked: boolean) => {
    setTeamIds((current) =>
      checked
        ? [...new Set([...current, teamId])]
        : current.filter((id) => id !== teamId)
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validationErrors = validateTeamMember({ email, firstName });

    if (validationErrors.length > 0) {
      setFormError(validationErrors[0]);
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const result = await saveTeamMemberFn({
        data: {
          email,
          firstName,
          id: member?.id,
          lastName,
          notes,
          phone,
          teamIds,
        },
      });
      await navigate({
        params: { memberId: result.id },
        to: "/members/$memberId",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save member.";
      setFormError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {member ? "Edit Team Member" : "New Team Member"}
          </h1>
          <p className="text-muted-foreground">
            Manage contact details and the teams this person serves on.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? "Saving…" : "Save member"}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Name, contact details, and notes for this team member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup className="md:grid md:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="member-first-name">First name</FieldLabel>
                <Input
                  id="member-first-name"
                  onChange={(event) => setFirstName(event.target.value)}
                  required
                  value={firstName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-last-name">Last name</FieldLabel>
                <Input
                  id="member-last-name"
                  onChange={(event) => setLastName(event.target.value)}
                  value={lastName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-email">Email</FieldLabel>
                <Input
                  id="member-email"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="member-phone">Phone</FieldLabel>
                <Input
                  id="member-phone"
                  onChange={(event) => setPhone(event.target.value)}
                  type="tel"
                  value={phone}
                />
              </Field>
              <Field className="md:col-span-2">
                <FieldLabel htmlFor="member-notes">Notes</FieldLabel>
                <Textarea
                  id="member-notes"
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Availability, instruments, language, reminders…"
                  rows={6}
                  value={notes}
                />
              </Field>
              {formError ? (
                <FieldDescription className="text-destructive md:col-span-2">
                  {formError}
                </FieldDescription>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>

        <aside className="xl:sticky xl:top-6 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Teams</CardTitle>
              <CardDescription>
                Select every team this person serves on.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {teamTree.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teams have been created yet.
                </p>
              ) : (
                teamTree.map((node) => (
                  <div className="flex flex-col gap-2" key={node.id}>
                    <Label className="flex items-center gap-2 font-medium">
                      <Checkbox
                        checked={teamIds.includes(node.id)}
                        onCheckedChange={(checked) =>
                          toggleTeam(node.id, checked === true)
                        }
                      />
                      {node.name}
                    </Label>
                    {node.children.map((child) => (
                      <Label
                        className="ml-6 flex items-center gap-2 text-muted-foreground"
                        key={child.id}
                      >
                        <Checkbox
                          checked={teamIds.includes(child.id)}
                          onCheckedChange={(checked) =>
                            toggleTeam(child.id, checked === true)
                          }
                        />
                        {child.name}
                      </Label>
                    ))}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </form>
  );
};
