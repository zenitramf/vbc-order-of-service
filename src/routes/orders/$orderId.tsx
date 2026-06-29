import {
  DownloadSimpleIcon,
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  PlusIcon,
} from "@phosphor-icons/react";
// oxlint-disable complexity, no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

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
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import {
  getHymnOptions,
  getOrder,
  getOrderEmailDelivery,
  getOrders,
  getPublishedOrderPdf,
  getReferenceData,
  getTeamMembers,
  getTeams,
  postOrderToCraftMyPdf,
  publishOrder,
  saveOrder,
  sendOrderEmail,
} from "~/lib/order-service-data";
import type {
  OrderEmailDeliveryRecord,
  OrderServiceTemplateJson,
  ServiceStatus,
} from "~/lib/order-service-types";
import {
  findMissingRequiredTeams,
  teamsById as toTeamsById,
} from "~/lib/teams-logic";

const getErrorMessage = (error: unknown, fallbackMessage: string): string =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const getServiceDateConflictMessage = (serviceDate: string) =>
  `An order of service already exists for ${serviceDate}.`;

const hasHymnActivityWithoutSelection = (
  orderJson: OrderServiceTemplateJson | null
): boolean =>
  Boolean(
    orderJson?.service_type.some((segment) =>
      segment.activities.some(
        (activity) => activity.activityType === "hymn" && !activity.hymnId
      )
    )
  );

const MISSING_HYMN_SELECTION_MESSAGE =
  "Select a hymn for every hymn activity before publishing or sending.";

const copyTextToClipboard = async (text: string): Promise<void> => {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.style.left = "-9999px";
  textArea.style.position = "fixed";
  textArea.style.top = "0";
  // oxlint-disable-next-line prefer-dom-node-append -- Workers DOM types mis-resolve Element#append.
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      throw new Error("Clipboard copy command was not available.");
    }
  } finally {
    textArea.remove();
  }
};

const OrderRoute = () => {
  const {
    emailDelivery: initialEmailDelivery,
    hymnOptions,
    order,
    orders,
    referenceData,
    teamMembers,
    teams,
  } = Route.useLoaderData();
  const router = useRouter();
  const saveOrderFn = useServerFn(saveOrder);
  const publishOrderFn = useServerFn(publishOrder);
  const postOrderToCraftMyPdfFn = useServerFn(postOrderToCraftMyPdf);
  const getPublishedOrderPdfFn = useServerFn(getPublishedOrderPdf);
  const sendOrderEmailFn = useServerFn(sendOrderEmail);
  const getOrderEmailDeliveryFn = useServerFn(getOrderEmailDelivery);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [emailDelivery, setEmailDelivery] =
    React.useState<OrderEmailDeliveryRecord | null>(initialEmailDelivery);
  const [title, setTitle] = React.useState(order?.title ?? "");
  const [serviceDate, setServiceDate] = React.useState(
    order?.serviceDate ?? ""
  );
  const [serviceTypeId, setServiceTypeId] = React.useState(
    order?.serviceTypeId ?? ""
  );
  const [status, setStatus] = React.useState<ServiceStatus>(
    order?.status ?? "Planning"
  );
  const [orderJson, setOrderJson] =
    React.useState<OrderServiceTemplateJson | null>(order?.order ?? null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const currentOrderId = order?.id ?? "";

  const hasServiceDateConflict = React.useMemo(
    () =>
      orders.some(
        (existingOrder) =>
          existingOrder.id !== order?.id &&
          existingOrder.serviceDate === serviceDate
      ),
    [order?.id, orders, serviceDate]
  );

  const serviceDateErrorMessage = hasServiceDateConflict
    ? getServiceDateConflictMessage(serviceDate)
    : formError;
  const hasMissingHymnSelection = hasHymnActivityWithoutSelection(orderJson);
  const teamsLookup = React.useMemo(() => toTeamsById(teams), [teams]);
  const missingRequiredTeams = React.useMemo(
    () => (orderJson ? findMissingRequiredTeams(orderJson, teamsLookup) : []),
    [orderJson, teamsLookup]
  );
  const hasMissingRequiredTeams = missingRequiredTeams.length > 0;
  const missingRequiredTeamsMessage = `Assign members to every required team before publishing: ${missingRequiredTeams
    .map((entry) => `${entry.teamName} (${entry.cardName})`)
    .join(", ")}.`;
  const saveSnapshot = React.useMemo(
    () =>
      JSON.stringify({
        order: orderJson ? { ...orderJson, name: title } : null,
        serviceDate,
        serviceTypeId,
        title,
      }),
    [orderJson, serviceDate, serviceTypeId, title]
  );
  const lastSavedSnapshotRef = React.useRef(saveSnapshot);

  const handleSave = React.useCallback(async (): Promise<boolean> => {
    if (hasServiceDateConflict) {
      setFormError(getServiceDateConflictMessage(serviceDate));
      return false;
    }

    if (!currentOrderId || !orderJson) {
      return false;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      await saveOrderFn({
        data: {
          id: currentOrderId,
          order: { ...orderJson, name: title },
          serviceDate,
          serviceTypeId,
          title,
        },
      });
      await router.invalidate();

      return true;
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to save order of service. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);

      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    currentOrderId,
    hasServiceDateConflict,
    orderJson,
    router,
    saveOrderFn,
    serviceDate,
    serviceTypeId,
    title,
  ]);

  React.useEffect(() => {
    if (lastSavedSnapshotRef.current === saveSnapshot) {
      return;
    }

    if (hasServiceDateConflict || !currentOrderId || !orderJson) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void (async () => {
        const saveSucceeded = await handleSave();

        if (saveSucceeded) {
          lastSavedSnapshotRef.current = saveSnapshot;
        }
      })();
    }, 800);

    return () => window.clearTimeout(timeoutId);
  }, [
    currentOrderId,
    handleSave,
    hasServiceDateConflict,
    orderJson,
    saveSnapshot,
  ]);

  const handlePublish = async () => {
    if (hasMissingHymnSelection) {
      setFormError(MISSING_HYMN_SELECTION_MESSAGE);
      toast.error(MISSING_HYMN_SELECTION_MESSAGE);
      return;
    }

    if (hasMissingRequiredTeams) {
      setFormError(missingRequiredTeamsMessage);
      toast.error(missingRequiredTeamsMessage);
      return;
    }

    const saveSucceeded = await handleSave();

    if (!saveSucceeded) {
      return;
    }

    setIsPublishing(true);
    setFormError(null);

    try {
      await publishOrderFn({ data: currentOrderId });
      setStatus("Published");
      await router.invalidate();
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to publish order of service. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    setFormError(null);

    try {
      const pdf = await getPublishedOrderPdfFn({ data: currentOrderId });
      const binary = window.atob(pdf.base64);
      const bytes = Uint8Array.from(
        binary,
        (character) => character.codePointAt(0) ?? 0
      );
      const url = window.URL.createObjectURL(
        new Blob([bytes], { type: "application/pdf" })
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = pdf.filename;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to download order of service. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsDownloading(false);
    }
  };

  const canPublish =
    status !== "Published" &&
    !hasMissingHymnSelection &&
    !hasMissingRequiredTeams &&
    !hasServiceDateConflict &&
    !isPublishing;

  const handleCopyCraftMyPdfData = async () => {
    if (!canPublish) {
      return;
    }

    const saveSucceeded = await handleSave();

    if (!saveSucceeded) {
      return;
    }

    try {
      const result = await postOrderToCraftMyPdfFn({
        data: { dryRun: true, orderId: currentOrderId },
      });
      await copyTextToClipboard(
        JSON.stringify(result.requestBody.data, null, 2)
      );
      toast.success("CraftMyPDF data copied to clipboard.");
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to copy CraftMyPDF data. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleSendEmail = async () => {
    if (hasMissingHymnSelection) {
      setFormError(MISSING_HYMN_SELECTION_MESSAGE);
      toast.error(MISSING_HYMN_SELECTION_MESSAGE);
      return;
    }

    setIsSendingEmail(true);
    setFormError(null);

    try {
      const delivery = await sendOrderEmailFn({ data: currentOrderId });
      setEmailDelivery(delivery);
      toast.success("Email Send Queued");
      await router.invalidate();
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to queue email. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSendingEmail(false);
    }
  };

  const publishButtonLabel = isPublishing ? "Publishing…" : "Publish and Send";
  const emailStatusLabel = emailDelivery?.status ?? "Not Sent";
  const sendEmailButtonLabel = isSendingEmail ? "Queueing…" : "Send Email";
  const downloadButtonLabel = isDownloading
    ? "Downloading…"
    : "Download Service";

  React.useEffect(() => {
    setEmailDelivery(initialEmailDelivery);
  }, [initialEmailDelivery]);

  React.useEffect(() => {
    if (
      !order ||
      !(
        emailDelivery?.status === "Queued" ||
        emailDelivery?.status === "Sending"
      )
    ) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void (async () => {
        const latestDelivery = await getOrderEmailDeliveryFn({
          data: currentOrderId,
        });

        if (!latestDelivery) {
          return;
        }

        setEmailDelivery((currentDelivery) => {
          if (
            currentDelivery?.status !== "Sent" &&
            latestDelivery.status === "Sent"
          ) {
            toast.success(`Message with ${latestDelivery.subject} Sent`);
          }

          return latestDelivery;
        });
      })();
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [currentOrderId, emailDelivery?.status, getOrderEmailDeliveryFn, order]);

  if (!order || !orderJson) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Order not found</EmptyTitle>
          <EmptyDescription>
            The requested order of service may have been deleted.
          </EmptyDescription>
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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1>
              <button
                type="button"
                className="font-heading text-left text-3xl font-semibold tracking-tight disabled:cursor-default"
                disabled={!canPublish}
                onDoubleClick={() => {
                  void handleCopyCraftMyPdfData();
                }}
              >
                Edit Order of Service
              </button>
            </h1>
            <Badge variant={status === "Published" ? "default" : "secondary"}>
              {status}
            </Badge>
            {status === "Published" ? (
              <Badge
                variant={
                  emailDelivery?.status === "Sent" ? "default" : "outline"
                }
              >
                Email: {emailStatusLabel}
              </Badge>
            ) : null}
          </div>
          <p className="text-muted-foreground">
            Plan service cards, select hymns, and prepare the order for
            publishing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={hasServiceDateConflict || isSaving || isPublishing}
            onClick={handleSave}
            type="button"
            variant="outline"
          >
            <FloppyDiskIcon data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save"}
          </Button>
          {status === "Published" ? (
            <>
              <Button
                disabled={isDownloading}
                onClick={handleDownload}
                type="button"
              >
                <DownloadSimpleIcon data-icon="inline-start" />
                {downloadButtonLabel}
              </Button>
              <Button
                disabled={
                  Boolean(emailDelivery) ||
                  hasMissingHymnSelection ||
                  isSendingEmail
                }
                onClick={handleSendEmail}
                type="button"
                variant="outline"
              >
                <PaperPlaneTiltIcon data-icon="inline-start" />
                {sendEmailButtonLabel}
              </Button>
            </>
          ) : (
            <Button
              disabled={!canPublish}
              onClick={handlePublish}
              type="button"
            >
              <PaperPlaneTiltIcon data-icon="inline-start" />
              {publishButtonLabel}
            </Button>
          )}
        </div>
      </div>

      {emailDelivery ? (
        <Card>
          <CardHeader>
            <CardTitle>Email delivery log</CardTitle>
            <CardDescription>
              Message with {emailDelivery.subject}{" "}
              {emailDelivery.status === "Sent" ? "sent" : "queued"}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Status</span>
              <Badge
                variant={
                  emailDelivery.status === "Sent" ? "default" : "outline"
                }
              >
                {emailDelivery.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Queued at {emailDelivery.queuedAt}
            </p>
            {emailDelivery.sentAt ? (
              <p className="text-muted-foreground">
                Sent at {emailDelivery.sentAt}
              </p>
            ) : null}
            {emailDelivery.errorMessage ? (
              <p className="text-destructive">{emailDelivery.errorMessage}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Service details</CardTitle>
          <CardDescription>
            Publishing generates a PDF, stores it in R2, and updates selected
            hymn usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="order-title">Title</FieldLabel>
              <Input
                id="order-title"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="order-date">
                Order of service date
              </FieldLabel>
              <Input
                id="order-date"
                onChange={(event) => {
                  setFormError(null);
                  setServiceDate(event.target.value);
                }}
                type="date"
                value={serviceDate}
              />
              <FieldDescription>
                Only one order of service can be scheduled per day.
              </FieldDescription>
              {serviceDateErrorMessage ? (
                <FieldDescription className="text-destructive">
                  {serviceDateErrorMessage}
                </FieldDescription>
              ) : null}
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
                  <NativeSelectOption
                    key={serviceType.id}
                    value={serviceType.id}
                  >
                    {serviceType.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldDescription>
                Templates manage service types. Save a modified template when
                you need a new reusable service type.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <OrderTemplateEditor
        activityTypes={referenceData.activityTypes}
        allowHymnSelection
        allowTeamAssignment
        hymnOptions={hymnOptions}
        onChange={(value) => setOrderJson({ ...value, name: title })}
        teamMembers={teamMembers}
        teams={teams}
        value={{ ...orderJson, name: title }}
      />
    </div>
  );
};

export const Route = createFileRoute("/orders/$orderId")({
  component: OrderRoute,
  loader: async ({ params }) => {
    const [
      order,
      referenceData,
      hymnOptions,
      orders,
      emailDelivery,
      teams,
      teamMembers,
    ] = await Promise.all([
      getOrder({ data: params.orderId }),
      getReferenceData(),
      getHymnOptions(),
      getOrders(),
      getOrderEmailDelivery({ data: params.orderId }),
      getTeams(),
      getTeamMembers(),
    ]);

    return {
      emailDelivery,
      hymnOptions,
      order,
      orders,
      referenceData,
      teamMembers,
      teams,
    };
  },
});
