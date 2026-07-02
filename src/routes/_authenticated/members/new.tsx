// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { MemberEditorPage } from "~/components/member-editor-page";
import { getTeams } from "~/lib/order-service-data";

const NewMemberRoute = () => {
  const allTeams = Route.useLoaderData();
  const { teamId } = Route.useSearch();

  return (
    <MemberEditorPage
      allTeams={allTeams}
      initialTeamIds={teamId ? [teamId] : undefined}
    />
  );
};

export const Route = createFileRoute("/_authenticated/members/new")({
  component: NewMemberRoute,
  loader: () => getTeams(),
  validateSearch: (search: Record<string, unknown>): { teamId?: string } => ({
    teamId: typeof search.teamId === "string" ? search.teamId : undefined,
  }),
});
