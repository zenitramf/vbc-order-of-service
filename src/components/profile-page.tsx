// oxlint-disable no-use-before-define
import { FloppyDiskIcon, KeyIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { ApiKeysCard } from "~/components/api-keys-card";
import { PasskeysCard } from "~/components/passkeys-card";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import type { SessionCardRow } from "~/components/user-editor-page";
import { SessionsCard } from "~/components/user-editor-page";
import { authClient } from "~/lib/auth-client";
import { updateOwnProfile } from "~/lib/auth.functions";
import type { PasskeySummary } from "~/lib/passkey-data";
import {
  applyDefaultPasskeyName,
  deleteMyPasskey,
  listMyPasskeys,
  renameMyPasskey,
} from "~/lib/passkey-data";
import { getInitials } from "~/lib/teams-logic";

export interface ProfilePageUser {
  email: string;
  firstName: string;
  id: string;
  image?: string | null;
  lastName: string;
  name: string;
  role?: string | null;
}

interface ProfilePageProps {
  user: ProfilePageUser;
}

interface MutationResult {
  error?: { message?: string } | null;
}

/** Toast the outcome of a Better Auth call; true when it succeeded. */
const notify = (result: MutationResult, successMessage: string): boolean => {
  if (result.error) {
    toast.error(result.error.message ?? "Something went wrong.");
    return false;
  }

  toast.success(successMessage);
  return true;
};

const toIso = (value: unknown): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === "string" ? value : "";
};

export const ProfilePage = ({ user }: ProfilePageProps) => {
  const router = useRouter();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sessions, setSessions] = useState<SessionCardRow[]>([]);
  const [passkeys, setPasskeys] = useState<PasskeySummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [addingPasskey, setAddingPasskey] = useState(false);

  const loadSessions = useCallback(async () => {
    const { data } = await authClient.listSessions();

    setSessions(
      (data ?? []).map((row) => ({
        createdAt: toIso(row.createdAt),
        expiresAt: toIso(row.expiresAt),
        id: row.id,
        impersonatedBy: null,
        ipAddress: row.ipAddress ?? null,
        revokeId: row.token,
        userAgent: row.userAgent ?? null,
      }))
    );
  }, []);

  const loadPasskeys = useCallback(async () => {
    try {
      setPasskeys(await listMyPasskeys());
    } catch (error) {
      setPasskeys([]);
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to load passkeys. Please try again."
      );
    }
  }, []);

  // Load the live sessions and passkeys once the page mounts.
  useEffect(() => {
    void loadSessions();
    void loadPasskeys();
  }, [loadSessions, loadPasskeys]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = () =>
    run(async () => {
      try {
        await updateOwnProfile({
          data: {
            email: email.trim(),
            firstName: firstName.trim(),
            lastName: lastName.trim(),
          },
        });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to save profile."
        );
        return;
      }

      toast.success("Profile updated.");
      await router.invalidate();
    });

  const handleChangePassword = () => {
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }

    return run(async () => {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
      });

      if (notify(result, "Password changed.")) {
        setCurrentPassword("");
        setNewPassword("");
      }
    });
  };

  const handleRevokeSession = (token: string) =>
    run(async () => {
      const result = await authClient.revokeSession({ token });

      if (notify(result, "Session revoked.")) {
        await loadSessions();
        // Revoking the current session logs this browser out; re-running the
        // authenticated guard will bounce to /login when that happens.
        await router.invalidate();
      }
    });

  const handleRevokeAll = () =>
    run(async () => {
      const result = await authClient.revokeSessions();

      if (notify(result, "Signed out of every device.")) {
        // Every session — including this one — is gone, so send the user to
        // the login screen from a clean load.
        window.location.href = "/login";
      }
    });

  const handleAddPasskey = async () => {
    setAddingPasskey(true);
    try {
      // The WebAuthn registration ceremony must run in the browser, so this
      // (and this alone) goes through the Better Auth client rather than a
      // server function. It uses the session cookie — no tokens are handled.
      const { data, error } = await authClient.passkey.addPasskey();

      if (error) {
        toast.error(error.message ?? "Could not add passkey.");
        return;
      }

      if (data?.id) {
        // Name it after the authenticator when the user didn't pick a name.
        try {
          await applyDefaultPasskeyName({ data: { id: data.id } });
        } catch {
          // A missing default name is non-fatal; the passkey still works.
        }
      }

      toast.success("Passkey added.");
      await loadPasskeys();
    } finally {
      setAddingPasskey(false);
    }
  };

  const handleRenamePasskey = (id: string, name: string) =>
    run(async () => {
      try {
        await renameMyPasskey({ data: { id, name } });
        toast.success("Passkey renamed.");
        await loadPasskeys();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to rename passkey."
        );
      }
    });

  const handleDeletePasskey = (id: string) =>
    run(async () => {
      try {
        await deleteMyPasskey({ data: { id } });
        toast.success("Passkey removed.");
        await loadPasskeys();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to remove passkey."
        );
      }
    });

  const initials = getInitials(
    firstName || user.firstName,
    lastName || user.lastName
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-4">
        <Avatar size="lg">
          {user.image ? <AvatarImage alt={user.name} src={user.image} /> : null}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-semibold tracking-tight">
            {user.name || "Your account"}
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
            <span>{user.email}</span>
            {user.role ? <Badge variant="secondary">{user.role}</Badge> : null}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your name and email. Your display name is built from your
              first and last name.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-first-name">First name</FieldLabel>
                <Input
                  id="profile-first-name"
                  onChange={(event) => setFirstName(event.target.value)}
                  value={firstName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-last-name">Last name</FieldLabel>
                <Input
                  id="profile-last-name"
                  onChange={(event) => setLastName(event.target.value)}
                  value={lastName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-email">Email</FieldLabel>
                <Input
                  id="profile-email"
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  value={email}
                />
              </Field>
              <Button
                className="w-fit"
                disabled={busy}
                onClick={handleSaveProfile}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                Save profile
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Change your password. You will stay signed in.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="profile-current-password">
                  Current password
                </FieldLabel>
                <Input
                  autoComplete="current-password"
                  id="profile-current-password"
                  onChange={(event) => setCurrentPassword(event.target.value)}
                  type="password"
                  value={currentPassword}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="profile-new-password">
                  New password
                </FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="profile-new-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={newPassword}
                />
              </Field>
              <Button
                className="w-fit"
                disabled={
                  busy ||
                  currentPassword.length === 0 ||
                  newPassword.length === 0
                }
                onClick={handleChangePassword}
                type="button"
                variant="outline"
              >
                <KeyIcon data-icon="inline-start" />
                Change password
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>

      <PasskeysCard
        adding={addingPasskey}
        busy={busy || addingPasskey}
        onAdd={handleAddPasskey}
        onDelete={handleDeletePasskey}
        onRename={handleRenamePasskey}
        passkeys={passkeys}
      />

      <ApiKeysCard />

      <SessionsCard
        busy={busy}
        onRevoke={handleRevokeSession}
        onRevokeAll={handleRevokeAll}
        sessions={sessions}
      />
    </div>
  );
};
