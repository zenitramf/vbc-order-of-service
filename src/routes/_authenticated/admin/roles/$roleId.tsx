// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { RoleEditorPage } from "~/components/role-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { getRole } from "~/lib/admin-data";

const RoleRoute = () => {
  const role = Route.useLoaderData();

  if (!role) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Role not found</EmptyTitle>
          <EmptyDescription>This role may have been removed.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/admin/roles">Back to roles</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return <RoleEditorPage role={role} />;
};

export const Route = createFileRoute("/_authenticated/admin/roles/$roleId")({
  component: RoleRoute,
  loader: ({ params }) => getRole({ data: params.roleId }),
});
