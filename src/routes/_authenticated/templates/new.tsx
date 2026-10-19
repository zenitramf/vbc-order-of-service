// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { TemplateEditorPage } from "~/components/template-editor-page";
import { getReferenceData, getTeams } from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const TemplatePendingSkeleton = () => (
  <EditorPageSkeleton cards={2} columns={2} fieldsPerCard={4} />
);

const NewTemplateRoute = () => {
  const { referenceData, teams } = Route.useLoaderData();

  return <TemplateEditorPage referenceData={referenceData} teams={teams} />;
};

const loadNewTemplateData = async () => {
  const [referenceData, teams] = await Promise.all([
    getReferenceData(),
    getTeams(),
  ]);

  return { referenceData, teams };
};

export const Route = createFileRoute("/_authenticated/templates/new")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "templates", "create");
  },
  component: NewTemplateRoute,
  loader: () => loadNewTemplateData(),
  pendingComponent: TemplatePendingSkeleton,
});
