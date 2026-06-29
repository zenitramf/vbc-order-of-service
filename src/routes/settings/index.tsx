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

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

const SettingsPage = () => {
  const { monthPlanning, settings, templates } = Route.useLoaderData();
  const router = useRouter();
  const addRecipient = useServerFn(addEmailRecipient);
  const deleteRecipient = useServerFn(deleteEmailRecipient);
  const saveSettings = useServerFn(saveEmailSettings);
  const [smtpAddress, setSmtpAddress] = React.useState(settings.smtpAddress);
  const [smtpPort, setSmtpPort] = React.useState(String(settings.smtpPort));
  const [smtpSenderName, setSmtpSenderName] = React.useState(
    settings.smtpSenderName
  );
  const [smtpUser, setSmtpUser] = React.useState("");
  const [smtpToken, setSmtpToken] = React.useState("");
  const [recipients, setRecipients] = React.useState(settings.recipients);
  const [newRecipient, setNewRecipient] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const portNumber = Number(smtpPort);
  const invalidRecipient =
    newRecipient.trim().length > 0 && !EMAIL_REGEX.test(newRecipient.trim());
  const canSave =
    smtpAddress.trim().length > 0 &&
    smtpSenderName.trim().length > 0 &&
    Number.isInteger(portNumber) &&
    portNumber >= 1 &&
    portNumber <= 65_535;

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
    const port = Number(smtpPort);

    if (!(smtpUser.trim() || settings.smtpUserConfigured)) {
      toast.error("Enter the SMTP user email address.");
      return;
    }

    if (!(smtpToken.trim() || settings.smtpTokenConfigured)) {
      toast.error("Enter the SMTP token.");
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        data: {
          recipients,
          smtpAddress,
          smtpPort: port,
          smtpSenderName,
          ...(smtpToken.trim() ? { smtpToken } : {}),
          ...(smtpUser.trim() ? { smtpUser } : {}),
        },
      });
      toast.success("Email settings saved.");
      await router.invalidate();
      setSmtpToken("");
      setSmtpUser("");
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
                  SMTP values are stored server-side. The user and token are
                  encrypted and never returned to the UI.
                </CardDescription>
              </div>
              <Badge
                variant={
                  settings.smtpTokenConfigured && settings.smtpUserConfigured
                    ? "secondary"
                    : "outline"
                }
              >
                {settings.smtpTokenConfigured && settings.smtpUserConfigured
                  ? "Configured"
                  : "Incomplete"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="smtp-address">SMTP address</FieldLabel>
                <Input
                  id="smtp-address"
                  onChange={(event) => setSmtpAddress(event.target.value)}
                  placeholder="smtp.example.com"
                  value={smtpAddress}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-port">SMTP port</FieldLabel>
                <Input
                  id="smtp-port"
                  max={65_535}
                  min={1}
                  onChange={(event) => setSmtpPort(event.target.value)}
                  placeholder="587"
                  type="number"
                  value={smtpPort}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-sender-name">Sender name</FieldLabel>
                <Input
                  id="smtp-sender-name"
                  onChange={(event) => setSmtpSenderName(event.target.value)}
                  placeholder="Victory Baptist Church"
                  value={smtpSenderName}
                />
                <FieldDescription>
                  This name is shown as the sender display name.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-user">SMTP user email</FieldLabel>
                <Input
                  autoComplete="off"
                  id="smtp-user"
                  onChange={(event) => setSmtpUser(event.target.value)}
                  placeholder={
                    settings.smtpUserConfigured
                      ? "Configured — enter a new value to replace"
                      : "mailer@example.com"
                  }
                  type="email"
                  value={smtpUser}
                />
                <FieldDescription>
                  The saved user is not displayed after it is stored.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-token">SMTP token</FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="smtp-token"
                  onChange={(event) => setSmtpToken(event.target.value)}
                  placeholder={
                    settings.smtpTokenConfigured
                      ? "Configured — enter a new value to replace"
                      : "SMTP app token"
                  }
                  type="password"
                  value={smtpToken}
                />
                <FieldDescription>
                  The token is encrypted at rest and is never returned to the
                  browser.
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

export const Route = createFileRoute("/settings/")({
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
