// oxlint-disable no-use-before-define
import { createFileRoute } from "@tanstack/react-router";

import { TemplateEditorPage } from "~/components/template-editor-page";
import { getReferenceData } from "~/lib/order-service-data";

const NewTemplateRoute = () => {
  const referenceData = Route.useLoaderData();

  return <TemplateEditorPage referenceData={referenceData} />;
};

export const Route = createFileRoute("/templates/new")({
  component: NewTemplateRoute,
  loader: () => getReferenceData(),
});
