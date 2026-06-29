import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/members/$memberId")({
  component: MemberRoute,
  loader: async ({ params }) => {
    const [member, allTeams] = await Promise.all([
      getTeamMember({ data: params.memberId }),
      getTeams(),
    ]);

    return { allTeams, member };
  },
});
