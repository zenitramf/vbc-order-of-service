// oxlint-disable no-use-before-define
import { Await, createFileRoute, defer } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { MemberEditorPage } from "~/components/member-editor-page";
import { getTeams } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const MemberPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const NewMemberRoute = () => {
  const { allTeams } = Route.useLoaderData();
  const { teamId } = Route.useSearch();

  return (
    <Await fallback={<MemberPendingSkeleton />} promise={allTeams}>
      {(resolvedTeams) => (
        <MemberEditorPage
          allTeams={resolvedTeams}
          initialTeamIds={teamId ? [teamId] : undefined}
        />
      )}
    </Await>
  );
};

export const Route = createFileRoute("/_authenticated/members/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "members", "create");
  },
  component: NewMemberRoute,
  loader: () => ({
    allTeams: defer(getTeams()),
  }),
  pendingComponent: MemberPendingSkeleton,
  validateSearch: (search: Record<string, unknown>): { teamId?: string } => ({
    teamId: typeof search.teamId === "string" ? search.teamId : undefined,
  }),
});
