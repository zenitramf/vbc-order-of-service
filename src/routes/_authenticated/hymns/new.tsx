// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { HymnEditorPage } from "~/components/hymn-editor-page";
import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { getReferenceData } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const HymnPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const NewHymnRoute = () => {
  const referenceData = Route.useLoaderData();

  return <HymnEditorPage referenceData={referenceData} />;
};

export const Route = createFileRoute("/_authenticated/hymns/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "hymns", "create");
  },
  component: NewHymnRoute,
  loader: () => getReferenceData(),
  pendingComponent: HymnPendingSkeleton,
});
