// oxlint-disable no-use-before-define
import { Link, createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "@phosphor-icons/react";

import { TemplateEditorPage } from "~/components/template-editor-page";
import { Button } from "~/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { getReferenceData, getTemplate } from "~/lib/order-service-data";

const TemplateRoute = () => {
  const { referenceData, template } = Route.useLoaderData();

  if (!template) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Template not found</EmptyTitle>
          <EmptyDescription>The requested template may have been deleted.</EmptyDescription>
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

  return <TemplateEditorPage referenceData={referenceData} template={template} />;
};

export const Route = createFileRoute("/templates/$templateId")({
  component: TemplateRoute,
  loader: async ({ params }) => {
    const [template, referenceData] = await Promise.all([
      getTemplate({ data: params.templateId }),
      getReferenceData(),
    ]);

    return { referenceData, template };
  },
});
