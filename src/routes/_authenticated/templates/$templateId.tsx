import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Await, Link, createFileRoute, defer } from "@tanstack/react-router";

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
  const { templateData } = Route.useLoaderData();

  return (
    <Await fallback={<TemplatePendingSkeleton />} promise={templateData}>
      {({ referenceData, teams, template }) =>
        template ? (
          <TemplateEditorPage
            referenceData={referenceData}
            teams={teams}
            template={template}
          />
        ) : (
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
        )
      }
    </Await>
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
  loader: ({ params }) => ({
    templateData: defer(loadTemplateData(params.templateId)),
  }),
  pendingComponent: TemplatePendingSkeleton,
});
