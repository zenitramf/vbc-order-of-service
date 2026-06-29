import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { TeamEditorPage } from "~/components/team-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  getTeam,
  getTeamMembers,
  getTeamTemplates,
  getTeams,
} from "~/lib/order-service-data";

const TeamRoute = () => {
  const { allMembers, allTeams, team, templates } = Route.useLoaderData();

  if (!team) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Team not found</EmptyTitle>
          <EmptyDescription>
            The requested team may have been deleted.
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
    );
  }

  return (
    <TeamEditorPage
      allMembers={allMembers}
      allTeams={allTeams}
      team={team}
      templates={templates}
    />
  );
};

export const Route = createFileRoute("/teams/$teamId")({
  component: TeamRoute,
  loader: async ({ params }) => {
    const [team, allTeams, allMembers, templates] = await Promise.all([
      getTeam({ data: params.teamId }),
      getTeams(),
      getTeamMembers(),
      getTeamTemplates({ data: params.teamId }),
    ]);

    return { allMembers, allTeams, team, templates };
  },
});
