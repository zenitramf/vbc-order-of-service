// oxlint-disable no-use-before-define
import {
  FloppyDiskIcon,
  PaperPlaneIcon,
  PlusIcon,
  TrashIcon,
} from "@phosphor-icons/react";
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
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { Separator } from "~/components/ui/separator";
import {
  addEmailRecipient,
  deleteEmailRecipient,
  getEmailSettings,
  getMonthPlanningSettings,
  getTeamsSettings,
  getTemplates,
  saveEmailSettings,
  saveTeamsSettings,
  sendTestEmail,
} from "~/lib/order-service-data";
import type {
  EmailSettingsRecord,
  SmtpAuthType,
} from "~/lib/order-service-types";
import { requirePermission } from "~/lib/route-guards";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

interface CredentialInput {
  isOAuth: boolean;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthTenantId: string;
  settings: EmailSettingsRecord;
  smtpToken: string;
  smtpUser: string;
}

const isEmailConfigured = (settings: EmailSettingsRecord): boolean => {
  if (!settings.smtpUserConfigured) {
    return false;
  }

  if (settings.smtpAuthType === "oauth2") {
    return (
      settings.oauthClientSecretConfigured &&
      settings.oauthTenantId.length > 0 &&
      settings.oauthClientId.length > 0
    );
  }

  return settings.smtpTokenConfigured;
};

const configuredPlaceholder = (
  isConfigured: boolean,
  emptyPlaceholder: string
): string =>
  isConfigured ? "Configured — enter a new value to replace" : emptyPlaceholder;

const getCredentialError = (input: CredentialInput): string | undefined => {
  if (!(input.smtpUser.trim() || input.settings.smtpUserConfigured)) {
    return "Enter the SMTP user email address.";
  }

  if (input.isOAuth) {
    if (!(input.oauthTenantId.trim() || input.settings.oauthTenantId)) {
      return "Enter the Entra tenant (directory) ID.";
    }

    if (!(input.oauthClientId.trim() || input.settings.oauthClientId)) {
      return "Enter the Entra application (client) ID.";
    }

    if (
      !(
        input.oauthClientSecret.trim() ||
        input.settings.oauthClientSecretConfigured
      )
    ) {
      return "Enter the Entra client secret.";
    }

    return undefined;
  }

  if (!(input.smtpToken.trim() || input.settings.smtpTokenConfigured)) {
    return "Enter the SMTP token.";
  }

  return undefined;
};

const SendTestEmailForm = () => {
  const sendTest = useServerFn(sendTestEmail);
  const [address, setAddress] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const invalidAddress =
    address.trim().length > 0 && !EMAIL_REGEX.test(address.trim());

  const onSend = async () => {
    const to = address.trim().toLowerCase();

    if (!EMAIL_REGEX.test(to)) {
      toast.error("Enter a valid email address.");
      return;
    }

    setIsSending(true);
    try {
      const result = await sendTest({ data: to });
      toast.success(
        `Test email sent via ${result.authType === "oauth2" ? "OAuth 2.0" : "password"}.`
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Test email could not be sent."
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <Separator />
      <Field data-invalid={invalidAddress || undefined}>
        <FieldLabel htmlFor="test-email-address">Send a test email</FieldLabel>
        <div className="flex gap-2">
          <Input
            aria-invalid={invalidAddress || undefined}
            id="test-email-address"
            onChange={(event) => setAddress(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onSend();
              }
            }}
            placeholder="you@example.com"
            type="email"
            value={address}
          />
          <Button
            disabled={isSending}
            onClick={() => void onSend()}
            type="button"
            variant="outline"
          >
            <PaperPlaneIcon data-icon="inline-start" />
            {isSending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {invalidAddress ? (
          <FieldDescription>Enter a valid email address.</FieldDescription>
        ) : (
          <FieldDescription>
            Uses the saved settings. Save first if you changed anything above.
          </FieldDescription>
        )}
      </Field>
    </>
  );
};

const useEmailConfiguration = (
  settings: EmailSettingsRecord,
  recipients: string[]
) => {
  const router = useRouter();
  const saveSettings = useServerFn(saveEmailSettings);
  const [smtpAddress, setSmtpAddress] = React.useState(settings.smtpAddress);
  const [smtpPort, setSmtpPort] = React.useState(String(settings.smtpPort));
  const [smtpSenderName, setSmtpSenderName] = React.useState(
    settings.smtpSenderName
  );
  const [smtpUser, setSmtpUser] = React.useState("");
  const [smtpToken, setSmtpToken] = React.useState("");
  const [smtpAuthType, setSmtpAuthType] = React.useState<SmtpAuthType>(
    settings.smtpAuthType
  );
  const [oauthTenantId, setOauthTenantId] = React.useState(
    settings.oauthTenantId
  );
  const [oauthClientId, setOauthClientId] = React.useState(
    settings.oauthClientId
  );
  const [oauthClientSecret, setOauthClientSecret] = React.useState("");
  const [isSaving, setIsSaving] = React.useState(false);

  const isOAuth = smtpAuthType === "oauth2";
  const portNumber = Number(smtpPort);
  const emailConfigured = isEmailConfigured(settings);
  const canSave =
    smtpAddress.trim().length > 0 &&
    smtpSenderName.trim().length > 0 &&
    Number.isInteger(portNumber) &&
    portNumber >= 1 &&
    portNumber <= 65_535;

  const onSave = async () => {
    const port = Number(smtpPort);
    const credentialError = getCredentialError({
      isOAuth,
      oauthClientId,
      oauthClientSecret,
      oauthTenantId,
      settings,
      smtpToken,
      smtpUser,
    });

    if (credentialError) {
      toast.error(credentialError);
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({
        data: {
          recipients,
          smtpAddress,
          smtpAuthType,
          smtpPort: port,
          smtpSenderName,
          ...(smtpToken.trim() ? { smtpToken } : {}),
          ...(smtpUser.trim() ? { smtpUser } : {}),
          ...(oauthTenantId.trim() ? { oauthTenantId } : {}),
          ...(oauthClientId.trim() ? { oauthClientId } : {}),
          ...(oauthClientSecret.trim() ? { oauthClientSecret } : {}),
        },
      });
      toast.success("Email settings saved.");
      await router.invalidate();
      setSmtpToken("");
      setSmtpUser("");
      setOauthClientSecret("");
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

  return {
    canSave,
    emailConfigured,
    isOAuth,
    isSaving,
    oauthClientId,
    oauthClientSecret,
    oauthTenantId,
    onSave,
    setOauthClientId,
    setOauthClientSecret,
    setOauthTenantId,
    setSmtpAddress,
    setSmtpAuthType,
    setSmtpPort,
    setSmtpSenderName,
    setSmtpToken,
    setSmtpUser,
    smtpAddress,
    smtpAuthType,
    smtpPort,
    smtpSenderName,
    smtpToken,
    smtpUser,
  };
};

const TeamsChannelForm = ({ initialEmail }: { initialEmail: string }) => {
  const router = useRouter();
  const saveSettings = useServerFn(saveTeamsSettings);
  const [channelEmail, setChannelEmail] = React.useState(initialEmail);
  const [isSaving, setIsSaving] = React.useState(false);
  const trimmedEmail = channelEmail.trim();
  const invalidEmail =
    trimmedEmail.length > 0 && !EMAIL_REGEX.test(trimmedEmail);

  const onSave = async () => {
    if (invalidEmail) {
      toast.error("Enter a valid Teams channel email address.");
      return;
    }

    setIsSaving(true);
    try {
      await saveSettings({ data: { channelEmail: trimmedEmail } });
      toast.success(
        trimmedEmail ? "Teams channel email saved." : "Teams posting disabled."
      );
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Teams settings could not be saved."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Microsoft Teams</CardTitle>
            <CardDescription>
              Publishing an order of service posts its PDF to this channel email
              address as “Order of Service for YYYY-MM-DD”. Leave blank to
              disable Teams posts.
            </CardDescription>
          </div>
          <Badge variant={initialEmail ? "secondary" : "outline"}>
            {initialEmail ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field data-invalid={invalidEmail || undefined}>
            <FieldLabel htmlFor="teams-channel-email">Channel email</FieldLabel>
            <div className="flex gap-2">
              <Input
                aria-invalid={invalidEmail || undefined}
                id="teams-channel-email"
                onChange={(event) => setChannelEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void onSave();
                  }
                }}
                placeholder="order-of-service@teams.example.com"
                type="email"
                value={channelEmail}
              />
              <Button
                disabled={isSaving}
                onClick={() => void onSave()}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                {isSaving ? "Saving…" : "Save"}
              </Button>
            </div>
            {invalidEmail ? (
              <FieldDescription>Enter a valid email address.</FieldDescription>
            ) : (
              <FieldDescription>
                In Teams, open the channel menu and choose “Get email address”,
                then paste it here.
              </FieldDescription>
            )}
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  );
};

const SettingsPage = () => {
  const { monthPlanning, settings, teams, templates } = Route.useLoaderData();
  const router = useRouter();
  const addRecipient = useServerFn(addEmailRecipient);
  const deleteRecipient = useServerFn(deleteEmailRecipient);
  const [recipients, setRecipients] = React.useState(settings.recipients);
  const [newRecipient, setNewRecipient] = React.useState("");
  const {
    canSave,
    emailConfigured,
    isOAuth,
    isSaving,
    oauthClientId,
    oauthClientSecret,
    oauthTenantId,
    onSave,
    setOauthClientId,
    setOauthClientSecret,
    setOauthTenantId,
    setSmtpAddress,
    setSmtpAuthType,
    setSmtpPort,
    setSmtpSenderName,
    setSmtpToken,
    setSmtpUser,
    smtpAddress,
    smtpAuthType,
    smtpPort,
    smtpSenderName,
    smtpToken,
    smtpUser,
  } = useEmailConfiguration(settings, recipients);

  const invalidRecipient =
    newRecipient.trim().length > 0 && !EMAIL_REGEX.test(newRecipient.trim());

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
              <Badge variant={emailConfigured ? "secondary" : "outline"}>
                {emailConfigured ? "Configured" : "Incomplete"}
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
                <FieldLabel htmlFor="smtp-auth-type">Authentication</FieldLabel>
                <NativeSelect
                  className="w-full"
                  id="smtp-auth-type"
                  onChange={(event) =>
                    setSmtpAuthType(event.target.value as SmtpAuthType)
                  }
                  value={smtpAuthType}
                >
                  <NativeSelectOption value="password">
                    Password / app password
                  </NativeSelectOption>
                  <NativeSelectOption value="oauth2">
                    OAuth 2.0 (Microsoft Entra)
                  </NativeSelectOption>
                </NativeSelect>
                <FieldDescription>
                  OAuth 2.0 is required for Exchange Online once Microsoft
                  retires Basic authentication for SMTP.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="smtp-user">SMTP user email</FieldLabel>
                <Input
                  autoComplete="off"
                  id="smtp-user"
                  onChange={(event) => setSmtpUser(event.target.value)}
                  placeholder={configuredPlaceholder(
                    settings.smtpUserConfigured,
                    "mailer@example.com"
                  )}
                  type="email"
                  value={smtpUser}
                />
                <FieldDescription>
                  {isOAuth
                    ? "The sending mailbox. It must be the mailbox your Entra app was granted access to."
                    : "The saved user is not displayed after it is stored."}
                </FieldDescription>
              </Field>
              {isOAuth ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="oauth-tenant-id">
                      Entra tenant (directory) ID
                    </FieldLabel>
                    <Input
                      autoComplete="off"
                      id="oauth-tenant-id"
                      onChange={(event) => setOauthTenantId(event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={oauthTenantId}
                    />
                    <FieldDescription>
                      From the app registration overview page in Entra.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oauth-client-id">
                      Entra application (client) ID
                    </FieldLabel>
                    <Input
                      autoComplete="off"
                      id="oauth-client-id"
                      onChange={(event) => setOauthClientId(event.target.value)}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                      value={oauthClientId}
                    />
                    <FieldDescription>
                      From the app registration overview page in Entra.
                    </FieldDescription>
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="oauth-client-secret">
                      Entra client secret
                    </FieldLabel>
                    <Input
                      autoComplete="new-password"
                      id="oauth-client-secret"
                      onChange={(event) =>
                        setOauthClientSecret(event.target.value)
                      }
                      placeholder={configuredPlaceholder(
                        settings.oauthClientSecretConfigured,
                        "Client secret value"
                      )}
                      type="password"
                      value={oauthClientSecret}
                    />
                    <FieldDescription>
                      The secret is encrypted at rest and is never returned to
                      the browser.
                    </FieldDescription>
                  </Field>
                </>
              ) : (
                <Field>
                  <FieldLabel htmlFor="smtp-token">SMTP token</FieldLabel>
                  <Input
                    autoComplete="new-password"
                    id="smtp-token"
                    onChange={(event) => setSmtpToken(event.target.value)}
                    placeholder={configuredPlaceholder(
                      settings.smtpTokenConfigured,
                      "SMTP app token"
                    )}
                    type="password"
                    value={smtpToken}
                  />
                  <FieldDescription>
                    The token is encrypted at rest and is never returned to the
                    browser.
                  </FieldDescription>
                </Field>
              )}
              <Button
                disabled={!canSave || isSaving}
                onClick={onSave}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                {isSaving ? "Saving…" : "Save email settings"}
              </Button>
              <SendTestEmailForm />
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

      <TeamsChannelForm initialEmail={teams.channelEmail} />

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
    const [settings, templates, monthPlanning, teams] = await Promise.all([
      getEmailSettings(),
      getTemplates(),
      getMonthPlanningSettings(),
      getTeamsSettings(),
    ]);

    return { monthPlanning, settings, teams, templates };
  },
});
