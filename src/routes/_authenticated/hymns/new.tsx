// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { HymnEditorPage } from "~/components/hymn-editor-page";
import { getReferenceData } from "~/lib/order-service-data";

const NewHymnRoute = () => {
  const referenceData = Route.useLoaderData();

  return <HymnEditorPage referenceData={referenceData} />;
};

export const Route = createFileRoute("/_authenticated/hymns/new")({
  component: NewHymnRoute,
  loader: () => getReferenceData(),
});
