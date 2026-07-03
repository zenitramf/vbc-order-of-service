import { PlusIcon } from "@phosphor-icons/react";
// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";

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

export const Route = createFileRoute("/_authenticated/templates/$templateId")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "templates", "view");
  },
  component: TemplateRoute,
  loader: async ({ params }) => {
    const [template, referenceData, teams] = await Promise.all([
      getTemplate({ data: params.templateId }),
      getReferenceData(),
      getTeams(),
    ]);

    return { referenceData, teams, template };
  },
});
