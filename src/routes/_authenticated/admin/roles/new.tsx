import { createFileRoute } from "@tanstack/react-router";

import { RoleEditorPage } from "~/components/role-editor-page";

export const Route = createFileRoute("/_authenticated/admin/roles/new")({
  component: () => <RoleEditorPage />,
});
