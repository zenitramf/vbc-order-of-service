// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { TeamEditorPage } from "~/components/team-editor-page";
import { getTeams } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const NewTeamRoute = () => {
  const allTeams = Route.useLoaderData();

  return <TeamEditorPage allMembers={[]} allTeams={allTeams} templates={[]} />;
};

export const Route = createFileRoute("/_authenticated/teams/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "teams", "create");
  },
  component: NewTeamRoute,
  loader: () => getTeams(),
});
