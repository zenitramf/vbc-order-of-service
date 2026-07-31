// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { PresentationDeckEditor } from "~/components/presentation-deck-editor";
import { getPresentationDeckEditor } from "~/lib/announcement-data";
import { requirePermission } from "~/lib/route-guards";

const PresentationDeckPage = () => {
  const slides = Route.useLoaderData();

  return <PresentationDeckEditor initialSlides={slides} />;
};

export const Route = createFileRoute("/_authenticated/announcements/deck")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "announcements", "view");
  },
  component: PresentationDeckPage,
  loader: () => getPresentationDeckEditor(),
});
