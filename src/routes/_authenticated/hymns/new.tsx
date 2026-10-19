// oxlint-disable no-use-before-define
import { Await, createFileRoute, defer } from "@tanstack/react-router";

import { HymnEditorPage } from "~/components/hymn-editor-page";
import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { getReferenceData } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const HymnPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const NewHymnRoute = () => {
  const { referenceData } = Route.useLoaderData();

  return (
    <Await fallback={<HymnPendingSkeleton />} promise={referenceData}>
      {(resolvedReferenceData) => (
        <HymnEditorPage referenceData={resolvedReferenceData} />
      )}
    </Await>
  );
};

export const Route = createFileRoute("/_authenticated/hymns/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "hymns", "create");
  },
  component: NewHymnRoute,
  loader: () => ({
    referenceData: defer(getReferenceData()),
  }),
  pendingComponent: HymnPendingSkeleton,
});
