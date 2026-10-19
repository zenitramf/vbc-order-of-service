import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Await, Link, createFileRoute, defer } from "@tanstack/react-router";

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
  const { memberData } = Route.useLoaderData();

  return (
    <Await fallback={<MemberPendingSkeleton />} promise={memberData}>
      {({ allTeams, member }) =>
        member ? (
          <MemberEditorPage allTeams={allTeams} member={member} />
        ) : (
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
        )
      }
    </Await>
  );
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
  loader: ({ params }) => ({
    memberData: defer(loadMemberData(params.memberId)),
  }),
  pendingComponent: MemberPendingSkeleton,
});
