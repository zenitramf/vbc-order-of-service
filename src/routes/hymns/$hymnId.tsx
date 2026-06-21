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
import { getHymn, getReferenceData } from "~/lib/order-service-data";

const HymnRoute = () => {
  const { hymn, referenceData } = Route.useLoaderData();

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

  return <HymnEditorPage hymn={hymn} referenceData={referenceData} />;
};

export const Route = createFileRoute("/hymns/$hymnId")({
  component: HymnRoute,
  loader: async ({ params }) => {
    const [hymn, referenceData] = await Promise.all([
      getHymn({ data: params.hymnId }),
      getReferenceData(),
    ]);

    return { hymn, referenceData };
  },
});
