// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { TeamEditorPage } from "~/components/team-editor-page";
import { getTeams } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const TeamPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={2} />
);

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
  pendingComponent: TeamPendingSkeleton,
});
