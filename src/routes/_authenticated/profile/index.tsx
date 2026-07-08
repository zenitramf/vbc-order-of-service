// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { ProfilePage } from "~/components/profile-page";

const ProfileRoute = () => {
  const { user } = Route.useRouteContext();

  return <ProfilePage user={user} />;
};

export const Route = createFileRoute("/_authenticated/profile/")({
  component: ProfileRoute,
});
