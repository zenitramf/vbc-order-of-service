import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { MemberEditorPage } from "~/components/member-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { getTeamMember, getTeams } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const MemberPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const MemberRoute = () => {
  const { allTeams, member } = Route.useLoaderData();

  if (!member) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Member not found</EmptyTitle>
          <EmptyDescription>
            The requested member may have been deleted.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/members/new">
              <PlusIcon data-icon="inline-start" />
              Create member
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <MemberEditorPage allTeams={allTeams} member={member} />;
};

const loadMemberData = async (memberId: string) => {
  const [member, allTeams] = await Promise.all([
    getTeamMember({ data: memberId }),
    getTeams(),
  ]);

  return { allTeams, member };
};

export const Route = createFileRoute("/_authenticated/members/$memberId")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "members", "view");
  },
  component: MemberRoute,
  loader: ({ params }) => loadMemberData(params.memberId),
  pendingComponent: MemberPendingSkeleton,
});
