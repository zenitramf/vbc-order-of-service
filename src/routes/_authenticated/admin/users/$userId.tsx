// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

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

const UserRoute = () => {
  const { apiKeys, currentUserId, passkeys, roles, sessions, user } =
    Route.useLoaderData();

  if (!user) {
    return (
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
    );
  }

  return (
    <UserEditorPage
      currentUserId={currentUserId}
      passkeys={passkeys}
      roles={roles}
      sessions={sessions}
      apiKeys={apiKeys}
      user={user}
    />
  );
};

export const Route = createFileRoute("/_authenticated/admin/users/$userId")({
  component: UserRoute,
  loader: async ({ context, params }) => {
    const [user, sessions, roles, passkeys, apiKeys] = await Promise.all([
      getUserAdmin({ data: params.userId }),
      getUserSessionsAdmin({ data: params.userId }),
      getRoles(),
      listUserPasskeysAdmin({ data: { userId: params.userId } }),
      listUserApiKeysAdmin({ data: params.userId }),
    ]);

    return {
      apiKeys,
      currentUserId: context.user.id,
      passkeys,
      roles,
      sessions,
      user,
    };
  },
});
