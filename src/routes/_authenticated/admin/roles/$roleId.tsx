// oxlint-disable no-use-before-define
import { Await, Link, createFileRoute, defer } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
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

const RolePendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const RoleRoute = () => {
  const { role } = Route.useLoaderData();

  return (
    <Await fallback={<RolePendingSkeleton />} promise={role}>
      {(resolvedRole) =>
        resolvedRole ? (
          <RoleEditorPage role={resolvedRole} />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Role not found</EmptyTitle>
              <EmptyDescription>
                This role may have been removed.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/admin/roles">Back to roles</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )
      }
    </Await>
  );
};

export const Route = createFileRoute("/_authenticated/admin/roles/$roleId")({
  component: RoleRoute,
  loader: ({ params }) => ({
    role: defer(getRole({ data: params.roleId })),
  }),
  pendingComponent: RolePendingSkeleton,
});
