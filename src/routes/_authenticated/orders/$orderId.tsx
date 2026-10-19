import {
  ArrowSquareOutIcon,
  CalendarBlankIcon,
  CodeIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FloppyDiskIcon,
  PaperPlaneTiltIcon,
  PencilSimpleIcon,
  PlusIcon,
  UploadSimpleIcon,
} from "@phosphor-icons/react";
// oxlint-disable complexity, no-use-before-define
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import { HtmlCodeEditor } from "~/components/html-code-editor";
import { EditorPageSkeleton } from "~/components/loading-skeletons";
import { OrderRosterSummary, RosterAttention } from "~/components/order-roster";
import { OrderTemplateEditor } from "~/components/order-template-editor";
import { Alert, AlertDescription } from "~/components/ui/alert";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "~/components/ui/empty";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { hasPermission } from "~/lib/admin-permissions";
import { buildOrderRoster } from "~/lib/order-roster";
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
  uploadOrderToSharePoint,
} from "~/lib/order-service-data";
import type {
  HymnOption,
  OrderEmailDeliveryRecord,
  OrderRecord,
  OrderServiceTemplateJson,
  OrderSummary,
  ReferenceData,
  ServiceStatus,
  SharePointUploadSkipReason,
  TeamMemberSummary,
  TeamSummary,
} from "~/lib/order-service-types";
import { requirePermission } from "~/lib/route-guards";
import {
  findMissingRequiredTeams,
  teamsById as toTeamsById,
  toggleOrderTeamMember,
} from "~/lib/teams-logic";

const getErrorMessage = (error: unknown, fallbackMessage: string): string =>
  error instanceof Error && error.message ? error.message : fallbackMessage;

const formatFullDate = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "full",
  }).format(new Date(`${value}T00:00:00`));

const formatTimestamp = (value: string): string => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

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

/** Toast action linking to the uploaded SharePoint file, instead of a raw URL. */
const sharePointToastAction = (webUrl: string) => (
  <a
    aria-label="Open in SharePoint"
    className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
    href={webUrl}
    rel="noopener noreferrer"
    target="_blank"
    title="Open in SharePoint"
  >
    <ArrowSquareOutIcon className="size-4" />
    Open
  </a>
);

const getSharePointUploadSkippedMessage = (
  reason: SharePointUploadSkipReason,
  afterPublish: boolean
): string => {
  const prefix = afterPublish ? "Published, but " : "";

  switch (reason) {
    case "auth-failed": {
      return `${prefix}SharePoint sign-in failed, so the PDF was not uploaded. Check the Entra app credentials in Settings and its Graph consent.`;
    }
    case "folder-failed": {
      return afterPublish
        ? "Published, but the SharePoint year folder could not be found or created, so the PDF was not uploaded."
        : "The SharePoint year folder could not be found or created, so the PDF was not uploaded.";
    }
    case "upload-failed": {
      return afterPublish
        ? "Published, but the SharePoint upload failed. Check Workers Logs."
        : "The SharePoint upload failed. Check Workers Logs.";
    }
    default: {
      return afterPublish
        ? "Published, but the SharePoint upload was skipped."
        : "The SharePoint upload was skipped.";
    }
  }
};

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

interface OrderEditorData {
  emailDelivery: OrderEmailDeliveryRecord | null;
  hymnOptions: HymnOption[];
  order: OrderRecord | null;
  orders: OrderSummary[];
  referenceData: ReferenceData;
  teamMembers: TeamMemberSummary[];
  teams: TeamSummary[];
}

const OrderEditorContent = ({
  emailDelivery: initialEmailDelivery,
  hymnOptions,
  order,
  orders,
  referenceData,
  teamMembers,
  teams,
}: OrderEditorData) => {
  const { permissions } = Route.useRouteContext();
  const canCreateHymns = hasPermission(permissions, "hymns", "create");
  const router = useRouter();
  const saveOrderFn = useServerFn(saveOrder);
  const publishOrderFn = useServerFn(publishOrder);
  const postOrderToCraftMyPdfFn = useServerFn(postOrderToCraftMyPdf);
  const getPublishedOrderPdfFn = useServerFn(getPublishedOrderPdf);
  const sendOrderEmailFn = useServerFn(sendOrderEmail);
  const uploadOrderToSharePointFn = useServerFn(uploadOrderToSharePoint);
  const getOrderEmailDeliveryFn = useServerFn(getOrderEmailDelivery);
  const [isSaving, setIsSaving] = React.useState(false);
  const [isPublishing, setIsPublishing] = React.useState(false);
  const [isDownloading, setIsDownloading] = React.useState(false);
  const [isSendingEmail, setIsSendingEmail] = React.useState(false);
  const [isSendingToSharePoint, setIsSendingToSharePoint] =
    React.useState(false);
  const [sharepointUploaded, setSharepointUploaded] = React.useState(
    Boolean(order?.sharepointUploadedAt)
  );
  const [isLoadingCraftMyPdfJson, setIsLoadingCraftMyPdfJson] =
    React.useState(false);
  const [craftMyPdfDialogOpen, setCraftMyPdfDialogOpen] = React.useState(false);
  const [craftMyPdfJson, setCraftMyPdfJson] = React.useState("");
  const [emailDelivery, setEmailDelivery] =
    React.useState<OrderEmailDeliveryRecord | null>(initialEmailDelivery);
  const [title] = React.useState(order?.title ?? "");
  const [serviceDate] = React.useState(order?.serviceDate ?? "");
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

  const selectedServiceTypeName = React.useMemo(
    () =>
      referenceData.serviceTypes.find(
        (serviceType) => serviceType.id === serviceTypeId
      )?.name ?? "Select service type",
    [referenceData.serviceTypes, serviceTypeId]
  );

  const hasMissingHymnSelection = hasHymnActivityWithoutSelection(orderJson);
  const teamsLookup = React.useMemo(() => toTeamsById(teams), [teams]);
  const roster = React.useMemo(
    () => (orderJson ? buildOrderRoster(orderJson, teams, teamMembers) : null),
    [orderJson, teamMembers, teams]
  );
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
      const result = await publishOrderFn({ data: currentOrderId });
      setStatus("Published");

      const { sharepointUpload } = result;

      if (sharepointUpload?.uploaded) {
        setSharepointUploaded(true);
        toast.success(
          "Published and uploaded to SharePoint.",
          sharepointUpload.webUrl
            ? { action: sharePointToastAction(sharepointUpload.webUrl) }
            : undefined
        );
      } else if (
        sharepointUpload?.reason &&
        sharepointUpload.reason !== "not-configured"
      ) {
        toast.warning(
          getSharePointUploadSkippedMessage(sharepointUpload.reason, true)
        );
      }

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

  const handleOpenCraftMyPdfJson = async () => {
    if (!currentOrderId) {
      return;
    }

    setIsLoadingCraftMyPdfJson(true);
    setFormError(null);

    try {
      if (!hasServiceDateConflict) {
        const saveSucceeded = await handleSave();

        if (!saveSucceeded) {
          return;
        }
      }

      const result = await postOrderToCraftMyPdfFn({
        data: { dryRun: true, orderId: currentOrderId },
      });
      setCraftMyPdfJson(JSON.stringify(result.requestBody, null, 2));
      setCraftMyPdfDialogOpen(true);
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to load CraftMyPDF JSON. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsLoadingCraftMyPdfJson(false);
    }
  };

  const handleCopyCraftMyPdfJson = async () => {
    if (!craftMyPdfJson) {
      return;
    }

    try {
      await copyTextToClipboard(craftMyPdfJson);
      toast.success("CraftMyPDF JSON copied to clipboard.");
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to copy CraftMyPDF JSON. Please try again."
      );
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

  const handleSendToSharePoint = async () => {
    setIsSendingToSharePoint(true);
    setFormError(null);

    try {
      const result = await uploadOrderToSharePointFn({
        data: currentOrderId,
      });

      if (result.uploaded) {
        setSharepointUploaded(true);
        toast.success(
          "Uploaded to SharePoint.",
          result.webUrl
            ? { action: sharePointToastAction(result.webUrl) }
            : undefined
        );
      } else if (result.reason && result.reason !== "not-configured") {
        toast.warning(getSharePointUploadSkippedMessage(result.reason, false));
      } else {
        toast.warning(
          "SharePoint upload is not configured. Check the Entra app credentials in Settings."
        );
      }

      await router.invalidate();
    } catch (error) {
      const errorMessage = getErrorMessage(
        error,
        "Unable to send to SharePoint. Please try again."
      );
      setFormError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setIsSendingToSharePoint(false);
    }
  };

  const publishButtonLabel = isPublishing ? "Publishing…" : "Publish";
  const emailStatusLabel = emailDelivery?.status ?? "Not Sent";
  const isEmailSent = emailDelivery?.status === "Sent";
  const sendEmailButtonLabel = isSendingEmail ? "Queueing…" : "Send Email";
  const sendToSharePointButtonLabel = isSendingToSharePoint
    ? "Sending…"
    : "Send to SharePoint";
  const downloadButtonLabel = isDownloading
    ? "Downloading…"
    : "Download Service";

  React.useEffect(() => {
    setEmailDelivery(initialEmailDelivery);
  }, [initialEmailDelivery]);

  React.useEffect(() => {
    setSharepointUploaded(Boolean(order?.sharepointUploadedAt));
  }, [order?.sharepointUploadedAt]);

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
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <h1 className="cursor-help font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
                    {title || "Untitled Order of Service"}
                  </h1>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Plan the service as one timeline: pick hymns and assign teams
                  timeblock by timeblock.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Badge variant={status === "Published" ? "success" : "warning"}>
              {status}
            </Badge>
            {status === "Published" && isEmailSent && emailDelivery ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge className="cursor-default" variant="success">
                      Email: {emailStatusLabel}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent className="flex max-w-xs flex-col items-stretch gap-1.5 py-2 text-left">
                    <span className="font-medium">{emailDelivery.subject}</span>
                    <div className="flex justify-between gap-4">
                      <span className="text-background/70">Queued</span>
                      <span className="tabular-nums">
                        {formatTimestamp(emailDelivery.queuedAt)}
                      </span>
                    </div>
                    {emailDelivery.sentAt ? (
                      <div className="flex justify-between gap-4">
                        <span className="text-background/70">Sent</span>
                        <span className="tabular-nums">
                          {formatTimestamp(emailDelivery.sentAt)}
                        </span>
                      </div>
                    ) : null}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}
            {status === "Published" && !isEmailSent ? (
              <Badge variant="warning">Email: {emailStatusLabel}</Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {serviceDate ? (
              <Badge className="gap-1.5" variant="outline">
                <CalendarBlankIcon aria-hidden />
                {formatFullDate(serviceDate)}
              </Badge>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2 py-0.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                >
                  {selectedServiceTypeName}
                  <PencilSimpleIcon aria-hidden />
                  <span className="sr-only">Edit service type</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuLabel>Service type</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuRadioGroup
                  onValueChange={setServiceTypeId}
                  value={serviceTypeId}
                >
                  {referenceData.serviceTypes.map((serviceType) => (
                    <DropdownMenuRadioItem
                      key={serviceType.id}
                      value={serviceType.id}
                    >
                      {serviceType.name}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            aria-label="View CraftMyPDF JSON"
            disabled={isLoadingCraftMyPdfJson || isSaving || isPublishing}
            onClick={() => {
              void handleOpenCraftMyPdfJson();
            }}
            size="icon"
            title="View CraftMyPDF JSON"
            type="button"
            variant="outline"
          >
            <CodeIcon />
            <span className="sr-only">
              {isLoadingCraftMyPdfJson
                ? "Loading CraftMyPDF JSON"
                : "View CraftMyPDF JSON"}
            </span>
          </Button>
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
              {sharepointUploaded ? null : (
                <Button
                  disabled={isSendingToSharePoint}
                  onClick={handleSendToSharePoint}
                  type="button"
                  variant="outline"
                >
                  <UploadSimpleIcon data-icon="inline-start" />
                  {sendToSharePointButtonLabel}
                </Button>
              )}
            </>
          ) : (
            <Button
              disabled={!canPublish}
              onClick={handlePublish}
              type="button"
              variant="cta"
            >
              <PaperPlaneTiltIcon data-icon="inline-start" />
              {publishButtonLabel}
            </Button>
          )}
        </div>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {emailDelivery && emailDelivery.status !== "Sent" ? (
        <Card>
          <CardHeader>
            <CardTitle>Email delivery log</CardTitle>
            <CardDescription>
              Message with {emailDelivery.subject} queued.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">Status</span>
              <Badge
                variant={
                  emailDelivery.status === "Failed" ? "destructive" : "info"
                }
              >
                {emailDelivery.status}
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Queued at {formatTimestamp(emailDelivery.queuedAt)}
            </p>
            {emailDelivery.sentAt ? (
              <p className="text-muted-foreground">
                Sent at {formatTimestamp(emailDelivery.sentAt)}
              </p>
            ) : null}
            {emailDelivery.errorMessage ? (
              <p className="text-destructive">{emailDelivery.errorMessage}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {roster?.hasTeams ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <CardTitle className="cursor-help">
                    Who&rsquo;s serving
                  </CardTitle>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Ushers, counters, and every other team for this service, by
                  timeblock. Add or remove people here, or in the timeline
                  below.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <RosterAttention roster={roster} />
          </CardHeader>
          <CardContent>
            <OrderRosterSummary
              editing={{
                onToggleMember: (cardId, teamId, memberId, assigned) =>
                  setOrderJson((current) =>
                    current
                      ? toggleOrderTeamMember(
                          current,
                          cardId,
                          teamId,
                          memberId,
                          assigned
                        )
                      : current
                  ),
                teamMembers,
              }}
              roster={roster}
            />
          </CardContent>
        </Card>
      ) : null}

      <OrderTemplateEditor
        activityTypes={referenceData.activityTypes}
        allowHymnCreation={canCreateHymns}
        allowHymnSelection
        allowTeamAssignment
        hymnOptions={hymnOptions}
        layout="timeline"
        onChange={(value) => setOrderJson({ ...value, name: title })}
        teamMembers={teamMembers}
        teams={teams}
        value={{ ...orderJson, name: title }}
      />

      <Dialog
        onOpenChange={setCraftMyPdfDialogOpen}
        open={craftMyPdfDialogOpen}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>CraftMyPDF request JSON</DialogTitle>
            <DialogDescription>
              Read-only preview of the payload that will be sent to CraftMyPDF
              when this order is published.
            </DialogDescription>
          </DialogHeader>
          {/* Mount only when open so CodeMirror lays out at full height. */}
          {craftMyPdfDialogOpen ? (
            <HtmlCodeEditor
              language="json"
              minHeight="28rem"
              readOnly
              value={craftMyPdfJson}
            />
          ) : null}
          <DialogFooter>
            <Button
              onClick={() => {
                void handleCopyCraftMyPdfJson();
              }}
              type="button"
              variant="outline"
            >
              <CopyIcon data-icon="inline-start" />
              Copy
            </Button>
            <Button
              onClick={() => {
                setCraftMyPdfDialogOpen(false);
              }}
              type="button"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const OrderPendingSkeleton = () => (
  <EditorPageSkeleton cards={3} columns={1} fieldsPerCard={3} />
);

const OrderRoute = () => {
  const data = Route.useLoaderData();

  return <OrderEditorContent {...data} />;
};

const loadOrderData = async (orderId: string): Promise<OrderEditorData> => {
  const [
    order,
    referenceData,
    hymnOptions,
    orders,
    emailDelivery,
    teams,
    teamMembers,
  ] = await Promise.all([
    getOrder({ data: orderId }),
    getReferenceData(),
    getHymnOptions(),
    getOrders(),
    getOrderEmailDelivery({ data: orderId }),
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
};

export const Route = createFileRoute("/_authenticated/orders/$orderId")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "orders", "view");
  },
  component: OrderRoute,
  loader: ({ params }) => loadOrderData(params.orderId),
  pendingComponent: OrderPendingSkeleton,
});
