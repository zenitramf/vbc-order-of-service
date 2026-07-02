// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { TeamEditorPage } from "~/components/team-editor-page";
import { getTeams } from "~/lib/order-service-data";

const NewTeamRoute = () => {
  const allTeams = Route.useLoaderData();

  return <TeamEditorPage allMembers={[]} allTeams={allTeams} templates={[]} />;
};

export const Route = createFileRoute("/_authenticated/teams/new")({
  component: NewTeamRoute,
  loader: () => getTeams(),
});
