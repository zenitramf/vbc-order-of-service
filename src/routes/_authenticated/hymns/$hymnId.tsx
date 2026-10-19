import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { HymnEditorPage } from "~/components/hymn-editor-page";
import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  getHymn,
  getHymnFiles,
  getReferenceData,
} from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const HymnPendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const HymnRoute = () => {
  const { files, hymn, referenceData } = Route.useLoaderData();

  if (!hymn) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Hymn not found</EmptyTitle>
          <EmptyDescription>
            The requested hymn may have been deleted.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/hymns/new">
              <PlusIcon data-icon="inline-start" />
              Add hymn
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <HymnEditorPage files={files} hymn={hymn} referenceData={referenceData} />
  );
};

const loadHymnData = async (hymnId: string) => {
  const [hymn, referenceData, files] = await Promise.all([
    getHymn({ data: hymnId }),
    getReferenceData(),
    getHymnFiles({ data: hymnId }),
  ]);

  return { files, hymn, referenceData };
};

export const Route = createFileRoute("/_authenticated/hymns/$hymnId")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "hymns", "view");
  },
  component: HymnRoute,
  loader: ({ params }) => loadHymnData(params.hymnId),
  pendingComponent: HymnPendingSkeleton,
});
