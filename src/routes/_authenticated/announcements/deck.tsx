// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { PresentationDeckEditor } from "~/components/presentation-deck-editor";
import { hasPermission } from "~/lib/admin-permissions";
import {
  getPresentationDeckEditor,
  getSilencePhoneMedia,
} from "~/lib/announcement-data";
import { requirePermission } from "~/lib/route-guards";

const PresentationDeckPage = () => {
  const { silencePhone, slides } = Route.useLoaderData();
  const { permissions } = Route.useRouteContext();
  const canEditSilencePhone = hasPermission(
    permissions,
    "announcements",
    "update"
  );

  return (
    <PresentationDeckEditor
      canEditSilencePhone={canEditSilencePhone}
      initialSilencePhone={silencePhone}
      initialSlides={slides}
    />
  );
};

export const Route = createFileRoute("/_authenticated/announcements/deck")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: PresentationDeckPage,
  loader: async () => {
    const [slides, silencePhone] = await Promise.all([
      getPresentationDeckEditor(),
      getSilencePhoneMedia(),
    ]);

    return { silencePhone, slides };
  },
});
