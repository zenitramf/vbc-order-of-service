// oxlint-disable no-use-before-define
import { Await, Link, createFileRoute, defer } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { UserEditorPage } from "~/components/user-editor-page";
import { getRoles, getUserAdmin, getUserSessionsAdmin } from "~/lib/admin-data";
import { listUserApiKeysAdmin } from "~/lib/api-key-data";
import { listUserPasskeysAdmin } from "~/lib/passkey-data";

const UserPendingSkeleton = () => (
  <EditorPageSkeleton cards={4} columns={2} fieldsPerCard={4} />
);

const UserRoute = () => {
  const { currentUserId, userData } = Route.useLoaderData();

  return (
    <Await fallback={<UserPendingSkeleton />} promise={userData}>
      {({ apiKeys, passkeys, roles, sessions, user }) =>
        user ? (
          <UserEditorPage
            apiKeys={apiKeys}
            currentUserId={currentUserId}
            passkeys={passkeys}
            roles={roles}
            sessions={sessions}
            user={user}
          />
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>User not found</EmptyTitle>
              <EmptyDescription>
                This account may have been removed.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/admin/users">Back to users</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )
      }
    </Await>
  );
};

const loadUserAdminData = async (userId: string) => {
  const [user, sessions, roles, passkeys, apiKeys] = await Promise.all([
    getUserAdmin({ data: userId }),
    getUserSessionsAdmin({ data: userId }),
    getRoles(),
    listUserPasskeysAdmin({ data: { userId } }),
    listUserApiKeysAdmin({ data: userId }),
  ]);

  return {
    apiKeys,
    passkeys,
    roles,
    sessions,
    user,
  };
};

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: UserRoute,
  loader: ({ context, params }) => ({
    currentUserId: context.user.id,
    userData: defer(loadUserAdminData(params.userId)),
  }),
  pendingComponent: UserPendingSkeleton,
});
