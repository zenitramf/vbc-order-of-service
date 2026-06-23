// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "@phosphor-icons/react";

import { HymnEditorPage } from "~/components/hymn-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { getHymn, getHymnFiles, getReferenceData } from "~/lib/order-service-data";

const HymnRoute = () => {
  const { files, hymn, referenceData } = Route.useLoaderData();

  if (!hymn) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Hymn not found</EmptyTitle>
          <EmptyDescription>The requested hymn may have been deleted.</EmptyDescription>
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

  return <HymnEditorPage files={files} hymn={hymn} referenceData={referenceData} />;
};

export const Route = createFileRoute("/hymns/$hymnId")({
  component: HymnRoute,
  loader: async ({ params }) => {
    const [hymn, referenceData, files] = await Promise.all([
      getHymn({ data: params.hymnId }),
      getReferenceData(),
      getHymnFiles({ data: params.hymnId }),
    ]);

    return { files, hymn, referenceData };
  },
});
