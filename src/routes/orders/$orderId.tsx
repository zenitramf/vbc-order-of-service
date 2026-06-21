// oxlint-disable no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { FloppyDiskIcon, PaperPlaneTiltIcon, PlusIcon } from "@phosphor-icons/react";
import * as React from "react";

import { OrderTemplateEditor } from "~/components/order-template-editor";
import { Badge } from "~/components/ui/badge";
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
import {
  getHymnOptions,
  getOrder,
  getReferenceData,
  publishOrder,
  saveOrder,
} from "~/lib/order-service-data";
import type { OrderServiceTemplateJson, ServiceStatus } from "~/lib/order-service-types";

const OrderRoute = () => {
  const { hymnOptions, order, referenceData } = Route.useLoaderData();
  const router = useRouter();
  const saveOrderFn = useServerFn(saveOrder);
  const publishOrderFn = useServerFn(publishOrder);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [title, setTitle] = React.useState(order?.title ?? "");
  const [serviceDate, setServiceDate] = React.useState(order?.serviceDate ?? "");
  const [serviceTypeId, setServiceTypeId] = React.useState(order?.serviceTypeId ?? "");
  const [status, setStatus] = React.useState<ServiceStatus>(order?.status ?? "Planning");
  const [orderJson, setOrderJson] = React.useState<OrderServiceTemplateJson | null>(
    order?.order ?? null
  );

  if (!order || !orderJson) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>The requested order of service may have been deleted.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to="/orders/new">
              <PlusIcon data-icon="inline-start" />
              Create order
            </Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const handleSave = async () => {
    setIsSaving(true);

    try {
      await saveOrderFn({
        data: {
          id: order.id,
          order: { ...orderJson, name: title },
          serviceDate,
          serviceTypeId,
          title,
        },
      });
      await router.invalidate();
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    await handleSave();
    setIsPublishing(true);

    try {
      await publishOrderFn({ data: order.id });
      setStatus("Published");
      await router.invalidate();
    } finally {
      setIsPublishing(false);
    }
  };

  let publishButtonLabel = "Publish and Send";

  if (status === "Published") {
    publishButtonLabel = "Published";
  } else if (isPublishing) {
    publishButtonLabel = "Publishing…";
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-heading text-3xl font-semibold tracking-tight">Edit Order of Service</h1>
            <Badge variant={status === "Published" ? "default" : "secondary"}>{status}</Badge>
          </div>
          <p className="text-muted-foreground">
            Plan service cards, select hymns, and prepare the order for publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button disabled={isSaving || isPublishing} onClick={handleSave} type="button" variant="outline">
            <FloppyDiskIcon data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button disabled={isPublishing || status === "Published"} onClick={handlePublish} type="button">
            <PaperPlaneTiltIcon data-icon="inline-start" />
            {publishButtonLabel}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Service details</CardTitle>
          <CardDescription>
            Publishing is a placeholder that marks this order Published and updates selected hymn usage.
          </CardDescription>
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
              <FieldLabel htmlFor="service-type">Service type</FieldLabel>
              <NativeSelect
                className="w-full"
                id="service-type"
                onChange={(event) => setServiceTypeId(event.target.value)}
                value={serviceTypeId}
              >
                {referenceData.serviceTypes.map((serviceType) => (
                  <NativeSelectOption key={serviceType.id} value={serviceType.id}>
                    {serviceType.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Templates manage service types. Save a modified template when you need a new reusable service type.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <OrderTemplateEditor
        activityTypes={referenceData.activityTypes}
        allowHymnSelection
        hymnOptions={hymnOptions}
        onChange={(value) => setOrderJson({ ...value, name: title })}
        value={{ ...orderJson, name: title }}
      />
    </div>
  );
};

export const Route = createFileRoute("/orders/$orderId")({
  component: OrderRoute,
  loader: async ({ params }) => {
    const [order, referenceData, hymnOptions] = await Promise.all([
      getOrder({ data: params.orderId }),
      getReferenceData(),
      getHymnOptions(),
    ]);

    return { hymnOptions, order, referenceData };
  },
});
