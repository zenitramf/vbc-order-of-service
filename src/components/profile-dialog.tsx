// oxlint-disable no-use-before-define
import { FloppyDiskIcon, KeyIcon } from "@phosphor-icons/react";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { SessionsCard } from "~/components/user-editor-page";
import type { AdminSessionSummary } from "~/lib/admin-data";
import { authClient } from "~/lib/auth-client";
import { updateOwnProfile } from "~/lib/auth.functions";
import { getInitials } from "~/lib/teams-logic";

export interface ProfileDialogUser {
  email: string;
  firstName: string;
  id: string;
  image?: string | null;
  lastName: string;
  name: string;
  role?: string | null;
}

interface ProfileDialogProps {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  user: ProfileDialogUser;
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

export const ProfileDialog = ({
  onOpenChange,
  open,
  user,
}: ProfileDialogProps) => {
  const router = useRouter();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [sessions, setSessions] = useState<AdminSessionSummary[]>([]);
  const [busy, setBusy] = useState(false);

  const loadSessions = useCallback(async () => {
    const { data } = await authClient.listSessions();

    setSessions(
      (data ?? []).map((row) => ({
        createdAt: toIso(row.createdAt),
        expiresAt: toIso(row.expiresAt),
        id: row.id,
        impersonatedBy: null,
        ipAddress: row.ipAddress ?? null,
        token: row.token,
        userAgent: row.userAgent ?? null,
      }))
    );
  }, []);

  // Reset the form to the live user and load sessions each time the dialog
  // opens so it never shows stale values from a previous session.
  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstName(user.firstName);
    setLastName(user.lastName);
    setEmail(user.email);
    setCurrentPassword("");
    setNewPassword("");
    void loadSessions();
  }, [open, user.firstName, user.lastName, user.email, loadSessions]);

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

  const initials = getInitials(
    firstName || user.firstName,
    lastName || user.lastName
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent
        className="max-h-[90svh] gap-6 overflow-y-auto sm:max-w-2xl"
        showCloseButton
      >
        <DialogHeader>
          <div className="flex items-center gap-4">
            <Avatar size="lg">
              {user.image ? (
                <AvatarImage alt={user.name} src={user.image} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1">
              <DialogTitle>{user.name || "Your account"}</DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-2">
                <span>{user.email}</span>
                {user.role ? (
                  <Badge variant="secondary">{user.role}</Badge>
                ) : null}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

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
                  <FieldLabel htmlFor="profile-first-name">
                    First name
                  </FieldLabel>
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

        <SessionsCard
          busy={busy}
          onRevoke={handleRevokeSession}
          onRevokeAll={handleRevokeAll}
          sessions={sessions}
        />
      </DialogContent>
    </Dialog>
  );
};
