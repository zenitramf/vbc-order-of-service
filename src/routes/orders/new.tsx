// oxlint-disable no-use-before-define
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarPlusIcon, PlusIcon } from "@phosphor-icons/react";
import * as React from "react";

import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { NativeSelect, NativeSelectOption } from "~/components/ui/native-select";
import { createOrder, getTemplates } from "~/lib/order-service-data";

const getNextSunday = () => {
  const date = new Date();
  const daysUntilSunday = (7 - date.getDay()) % 7;
  date.setDate(date.getDate() + daysUntilSunday);

  return date.toISOString().slice(0, 10);
};

const NewOrderPage = () => {
  const templates = Route.useLoaderData();
  const navigate = useNavigate();
  const createOrderFn = useServerFn(createOrder);
  const [templateId, setTemplateId] = React.useState(templates[0]?.id ?? "");
  const [serviceDate, setServiceDate] = React.useState(getNextSunday());
  const [title, setTitle] = React.useState("Sunday Order of Service");
  const [isCreating, setIsCreating] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!templateId) {
      return;
    }

    setIsCreating(true);

    try {
      const result = await createOrderFn({ data: { serviceDate, templateId, title } });
      await navigate({ params: { orderId: result.id }, to: "/orders/$orderId" });
    } finally {
      setIsCreating(false);
    }
  };

  if (templates.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Create a template first</EmptyTitle>
          <EmptyDescription>Orders are created from reusable templates.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/templates/new">
              <PlusIcon data-icon="inline-start" />
              New template
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Create Order of Service</h1>
        <p className="text-muted-foreground">Choose a template and service date to start planning.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service details</CardTitle>
          <CardDescription>The new order starts in Planning status.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="order-title">Title</FieldLabel>
              <Input id="order-title" onChange={(event) => setTitle(event.target.value)} value={title} />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-date">Order of service date</FieldLabel>
              <Input
                id="order-date"
                onChange={(event) => setServiceDate(event.target.value)}
                type="date"
                value={serviceDate}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-template">Template</FieldLabel>
              <NativeSelect
                className="w-full"
                id="order-template"
                onChange={(event) => setTemplateId(event.target.value)}
                value={templateId}
              >
                {templates.map((template) => (
                  <NativeSelectOption key={template.id} value={template.id}>
                    {template.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                The selected template supplies the service type, cards, and default activities.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button disabled={isCreating || !templateId} type="submit">
          <CalendarPlusIcon data-icon="inline-start" />
          {isCreating ? "Creating…" : "Create order"}
        </Button>
      </div>
    </form>
  );
};

export const Route = createFileRoute("/orders/new")({
  component: NewOrderPage,
  loader: () => getTemplates(),
});
