import { FloppyDiskIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";

import { OrderTemplateEditor } from "~/components/order-template-editor";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { saveTemplate } from "~/lib/order-service-data";
import type {
  OrderServiceTemplateJson,
  ReferenceData,
  TeamSummary,
  TemplateRecord,
} from "~/lib/order-service-types";

const blankTemplate: OrderServiceTemplateJson = {
  name: "New Service Template",
  service_type: [
    {
      activities: [
        {
          activityName: "Opening Hymn",
          activityType: "hymn",
          id: "new-template-opening-hymn",
        },
      ],
      id: "new-template-service-segment",
      typeName: "Service Segment",
    },
  ],
};

interface TemplateEditorPageProps {
  referenceData: ReferenceData;
  teams: TeamSummary[];
  template?: TemplateRecord;
}

export const TemplateEditorPage = ({
  referenceData,
  teams,
  template,
}: TemplateEditorPageProps) => {
  const navigate = useNavigate();
  const saveTemplateFn = useServerFn(saveTemplate);
  const [name, setName] = React.useState(template?.name ?? blankTemplate.name);
  const [templateJson, setTemplateJson] =
    React.useState<OrderServiceTemplateJson>(
      template?.template ?? blankTemplate
    );
  const [isSaving, setIsSaving] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);

    try {
      const result = await saveTemplateFn({
        data: {
          id: template?.id,
          name,
          template: { ...templateJson, name },
        },
      });
      await navigate({
        params: { templateId: result.id },
        to: "/templates/$templateId",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {template ? "Edit Template" : "New Template"}
          </h1>
          <p className="text-muted-foreground">
            Build a reusable service plan. Saving updates the matching service
            type for future orders.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <FloppyDiskIcon data-icon="inline-start" />
          {isSaving ? "Saving…" : "Save template"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template details</CardTitle>
          <CardDescription>
            Name the template and service type users will choose when creating
            orders.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="template-name">
                Template and service type name
              </FieldLabel>
              <Input
                id="template-name"
                onChange={(event) => {
                  setName(event.target.value);
                  setTemplateJson((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                }}
                value={name}
              />
              <FieldDescription>
                Examples: Sunday Service, Thursday Service, Revival, Missions
                Conference.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <OrderTemplateEditor
        activityTypes={referenceData.activityTypes}
        allowTeamDefinition
        onChange={(value) => setTemplateJson({ ...value, name })}
        teams={teams}
        value={{ ...templateJson, name }}
      />
    </form>
  );
};
