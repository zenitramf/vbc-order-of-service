import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { TemplateEditorPage } from "~/components/template-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  getReferenceData,
  getTeams,
  getTemplate,
} from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const TemplatePendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const TemplateRoute = () => {
  const { referenceData, teams, template } = Route.useLoaderData();

  if (!template) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Template not found</EmptyTitle>
          <EmptyDescription>
            The requested template may have been deleted.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/templates/new">
              <PlusIcon data-icon="inline-start" />
              Create template
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <TemplateEditorPage
      referenceData={referenceData}
      teams={teams}
      template={template}
    />
  );
};

const loadTemplateData = async (templateId: string) => {
  const [template, referenceData, teams] = await Promise.all([
    getTemplate({ data: templateId }),
    getReferenceData(),
    getTeams(),
  ]);

  return { referenceData, teams, template };
};

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "templates", "view");
  },
  component: TemplateRoute,
  loader: ({ params }) => loadTemplateData(params.templateId),
  pendingComponent: TemplatePendingSkeleton,
});
