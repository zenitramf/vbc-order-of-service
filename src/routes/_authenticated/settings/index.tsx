// oxlint-disable no-use-before-define
import { FloppyDiskIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import * as React from "react";
import { toast } from "sonner";

import { MonthPlannerSettings } from "~/components/month-planner-settings";
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
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import {
  addEmailRecipient,
  deleteEmailRecipient,
  getEmailSettings,
  getMonthPlanningSettings,
  getTemplates,
  saveEmailSettings,
} from "~/lib/order-service-data";
import { requirePermission } from "~/lib/route-guards";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const SettingsPage = () => {
  const { monthPlanning, settings, templates } = Route.useLoaderData();
  const router = useRouter();
  const addRecipient = useServerFn(addEmailRecipient);
  const deleteRecipient = useServerFn(deleteEmailRecipient);
  const saveSettings = useServerFn(saveEmailSettings);
  const [fromEmail, setFromEmail] = React.useState(settings.fromEmail);
  const [senderName, setSenderName] = React.useState(settings.senderName);
  const [recipients, setRecipients] = React.useState(settings.recipients);
  const [newRecipient, setNewRecipient] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const invalidRecipient =
    newRecipient.trim().length > 0 && !EMAIL_REGEX.test(newRecipient.trim());
  const canSave =
    senderName.trim().length > 0 &&
    (fromEmail.trim().length > 0 || settings.fromEmailConfigured);

  const onAddRecipient = async () => {
    const email = newRecipient.trim().toLowerCase();

    if (!EMAIL_REGEX.test(email)) {
      toast.error("Enter a valid recipient email address.");
      return;
    }

    if (recipients.includes(email)) {
      toast.error("That recipient is already listed.");
      return;
    }

    try {
      await addRecipient({ data: email });
      setRecipients((current) => [...current, email].sort());
      setNewRecipient("");
      toast.success("Recipient added.");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Recipient could not be added."
      );
    }
  };

  const onDeleteRecipient = async (email: string) => {
    try {
      await deleteRecipient({ data: email });
      setRecipients((current) =>
        current.filter((recipient) => recipient !== email)
      );
      toast.success("Recipient removed.");
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Recipient could not be removed."
      );
    }
  };

  const onSave = async () => {
    if (!(fromEmail.trim() || settings.fromEmailConfigured)) {
      toast.error("Enter the sender email address.");
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        data: {
          recipients,
          senderName,
          ...(fromEmail.trim() ? { fromEmail } : {}),
        },
      });
      toast.success("Email settings saved.");
      await router.invalidate();
      setFromEmail("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Email settings could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight">
          Settings
        </h1>
        <p className="text-muted-foreground">
          Configure application settings for upcoming order of service email
          delivery.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <CardTitle>Email configuration</CardTitle>
                <CardDescription>
                  Sent through Resend. The API key is a Worker secret and is
                  never returned to the UI.
                </CardDescription>
              </div>
              <Badge
                variant={settings.fromEmailConfigured ? "secondary" : "outline"}
              >
                {settings.fromEmailConfigured ? "Configured" : "Incomplete"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sender-name">Sender name</FieldLabel>
                <Input
                  id="sender-name"
                  onChange={(event) => setSenderName(event.target.value)}
                  placeholder="Victory Baptist Church"
                  value={senderName}
                />
                <FieldDescription>
                  This name is shown as the sender display name.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="from-email">Sender email</FieldLabel>
                <Input
                  autoComplete="off"
                  id="from-email"
                  onChange={(event) => setFromEmail(event.target.value)}
                  placeholder={
                    settings.fromEmailConfigured
                      ? "Configured — enter a new value to replace"
                      : "mailer@example.com"
                  }
                  type="email"
                  value={fromEmail}
                />
                <FieldDescription>
                  Must be a sender address verified in Resend. The saved address
                  is not displayed after it is stored.
                </FieldDescription>
              </Field>
              <Button
                disabled={!canSave || isSaving}
                onClick={onSave}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                {isSaving ? "Saving…" : "Save email settings"}
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email recipients</CardTitle>
            <CardDescription>
              Manage the default recipient list that will receive generated
              order of service PDFs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={invalidRecipient || undefined}>
                <FieldLabel htmlFor="recipient-email">
                  Recipient email
                </FieldLabel>
                <div className="flex gap-2">
                  <Input
                    aria-invalid={invalidRecipient || undefined}
                    id="recipient-email"
                    onChange={(event) => setNewRecipient(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void onAddRecipient();
                      }
                    }}
                    placeholder="recipient@example.com"
                    type="email"
                    value={newRecipient}
                  />
                  <Button
                    onClick={() => void onAddRecipient()}
                    type="button"
                    variant="outline"
                  >
                    <PlusIcon data-icon="inline-start" />
                    Add
                  </Button>
                </div>
                {invalidRecipient ? (
                  <FieldDescription>
                    Enter a valid email address.
                  </FieldDescription>
                ) : null}
              </Field>

              <div className="flex flex-col gap-3">
                {recipients.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    No recipients have been added yet.
                  </p>
                ) : (
                  recipients.map((email) => (
                    <div
                      className="flex items-center justify-between gap-3 rounded-lg border p-3"
                      key={email}
                    >
                      <span className="truncate text-sm">{email}</span>
                      <Button
                        onClick={() => void onDeleteRecipient(email)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <TrashIcon data-icon="inline-start" />
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <MonthPlannerSettings settings={monthPlanning} templates={templates} />
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/settings/")({
  beforeLoad: ({ context }) => {
    requirePermission(context.permissions, "settings", "view");
  },
  component: SettingsPage,
  loader: async () => {
    const [settings, templates, monthPlanning] = await Promise.all([
      getEmailSettings(),
      getTemplates(),
      getMonthPlanningSettings(),
    ]);

    return { monthPlanning, settings, templates };
  },
});
