import {
  ArrowLeftIcon,
  FloppyDiskIcon,
  KeyIcon,
  ProhibitIcon,
  SignInIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { AdminSessionSummary, AdminUserSummary } from "~/lib/admin-data";
import type { RoleRecord } from "~/lib/admin-permissions";
import {
  revokeUserSessionAdmin,
  revokeUserSessionsAdmin,
} from "~/lib/admin-revoke";
import { authClient } from "~/lib/auth-client";

interface UserEditorPageProps {
  currentUserId: string;
  roles: RoleRecord[];
  sessions: AdminSessionSummary[];
  user: AdminUserSummary;
}

interface MutationResult {
  error?: { message?: string } | null;
}

/** Toast the outcome of a Better Auth admin call; true when it succeeded. */
const notify = (result: MutationResult, successMessage: string): boolean => {
  if (result.error) {
    toast.error(result.error.message ?? "Something went wrong.");
    return false;
  }

  toast.success(successMessage);
  return true;
};

export const formatDateTime = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(date);
};

export interface SessionCardRow extends AdminSessionSummary {
  revokeId?: string;
}

interface SessionsCardProps {
  busy: boolean;
  onRevoke: (revokeId: string) => void;
  onRevokeAll: () => void;
  sessions: SessionCardRow[];
}

export const SessionsCard = ({
  busy,
  onRevoke,
  onRevokeAll,
  sessions,
}: SessionsCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>
            Every device currently signed in as this user.
          </CardDescription>
        </div>
        {sessions.length > 0 ? (
          <Button
            disabled={busy}
            onClick={onRevokeAll}
            size="sm"
            type="button"
            variant="outline"
          >
            Revoke all
          </Button>
        ) : null}
      </div>
    </CardHeader>
    <CardContent>
      {sessions.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          This user has no active sessions.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead>IP address</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((sessionRow) => (
              <TableRow key={sessionRow.id}>
                <TableCell>{formatDateTime(sessionRow.createdAt)}</TableCell>
                <TableCell>{formatDateTime(sessionRow.expiresAt)}</TableCell>
                <TableCell>{sessionRow.ipAddress || "—"}</TableCell>
                <TableCell className="max-w-[16rem] truncate">
                  {sessionRow.impersonatedBy ? (
                    <Badge variant="outline">Impersonation</Badge>
                  ) : (
                    sessionRow.userAgent || "—"
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      onRevoke(sessionRow.revokeId ?? sessionRow.id)
                    }
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Revoke
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </CardContent>
  </Card>
);

interface DangerZoneCardProps {
  banned: boolean;
  busy: boolean;
  isSelf: boolean;
  onImpersonate: () => void;
  onRemove: () => void;
  onToggleBan: () => void;
}

const DangerZoneCard = ({
  banned,
  busy,
  isSelf,
  onImpersonate,
  onRemove,
  onToggleBan,
}: DangerZoneCardProps) => (
  <Card>
    <CardHeader>
      <CardTitle>Danger zone</CardTitle>
      <CardDescription>
        Impersonation, ban, and deletion actions.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-3">
      <Button
        className="w-full justify-start"
        disabled={busy || isSelf}
        onClick={onImpersonate}
        type="button"
        variant="outline"
      >
        <SignInIcon data-icon="inline-start" />
        Impersonate user
      </Button>
      <Button
        className="w-full justify-start"
        disabled={busy || isSelf}
        onClick={onToggleBan}
        type="button"
        variant="outline"
      >
        <ProhibitIcon data-icon="inline-start" />
        {banned ? "Unban user" : "Ban user"}
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            className="w-full justify-start"
            disabled={busy || isSelf}
            type="button"
            variant="destructive"
          >
            <TrashIcon data-icon="inline-start" />
            Remove user
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this user?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the account and all of their sessions.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onRemove} variant="destructive">
              Remove user
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {isSelf ? (
        <p className="text-muted-foreground text-sm">
          You cannot impersonate, ban, or remove your own account.
        </p>
      ) : null}
    </CardContent>
  </Card>
);

export const UserEditorPage = ({
  currentUserId,
  roles,
  sessions,
  user,
}: UserEditorPageProps) => {
  const navigate = useNavigate();
  const router = useRouter();

  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role ?? "user");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const isSelf = user.id === currentUserId;

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
      const trimmedFirstName = firstName.trim();
      const trimmedLastName = lastName.trim();
      const computedName = `${trimmedFirstName} ${trimmedLastName}`.trim();
      const result = await authClient.admin.updateUser({
        data: {
          email: email.trim(),
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
          name: computedName,
        },
        userId: user.id,
      });

      if (notify(result, "Profile updated.")) {
        await router.invalidate();
      }
    });

  const handleSaveRole = () =>
    run(async () => {
      const result = await authClient.admin.setRole({
        role: role as "admin" | "user",
        userId: user.id,
      });

      if (notify(result, "Role updated.")) {
        await router.invalidate();
      }
    });

  const handleSetPassword = () => {
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    return run(async () => {
      const result = await authClient.admin.setUserPassword({
        newPassword,
        userId: user.id,
      });

      if (notify(result, "Password set.")) {
        setNewPassword("");
      }
    });
  };

  const handleRevokeSession = (sessionId: string) =>
    run(async () => {
      try {
        await revokeUserSessionAdmin({ data: { sessionId, userId: user.id } });
        toast.success("Session revoked.");
        await router.invalidate();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to revoke session."
        );
      }
    });

  const handleRevokeAll = () =>
    run(async () => {
      try {
        await revokeUserSessionsAdmin({ data: { userId: user.id } });
        toast.success("All sessions revoked.");
        await router.invalidate();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Unable to revoke sessions."
        );
      }
    });

  const handleImpersonate = () =>
    run(async () => {
      const { error } = await authClient.admin.impersonateUser({
        userId: user.id,
      });

      if (error) {
        toast.error(error.message ?? "Unable to impersonate user.");
        return;
      }

      // The session cookie now points at the impersonated user; reload from the
      // root so every loader re-runs under the new identity.
      window.location.href = "/";
    });

  const handleToggleBan = () =>
    run(async () => {
      const result = user.banned
        ? await authClient.admin.unbanUser({ userId: user.id })
        : await authClient.admin.banUser({ userId: user.id });

      if (notify(result, user.banned ? "User unbanned." : "User banned.")) {
        await router.invalidate();
      }
    });

  const handleRemove = () =>
    run(async () => {
      const result = await authClient.admin.removeUser({ userId: user.id });

      if (notify(result, "User removed.")) {
        await navigate({ to: "/admin/users" });
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button asChild className="w-fit px-0" size="sm" variant="link">
          <Link to="/admin/users">
            <ArrowLeftIcon data-icon="inline-start" />
            Back to users
          </Link>
        </Button>
        <h1 className="font-heading font-semibold text-3xl tracking-tight">
          {user.name || "Unnamed user"}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>{user.email}</span>
          {user.role ? <Badge variant="secondary">{user.role}</Badge> : null}
          {user.banned ? <Badge variant="destructive">Banned</Badge> : null}
          {isSelf ? <Badge variant="outline">You</Badge> : null}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update the user's first name, last name, and email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user-first-name">First name</FieldLabel>
                <Input
                  id="user-first-name"
                  onChange={(event) => setFirstName(event.target.value)}
                  value={firstName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-last-name">Last name</FieldLabel>
                <Input
                  id="user-last-name"
                  onChange={(event) => setLastName(event.target.value)}
                  value={lastName}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="user-email">Email</FieldLabel>
                <Input
                  id="user-email"
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
            <CardTitle>Role &amp; access</CardTitle>
            <CardDescription>
              Assign the role that governs what this user can do.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user-role">Role</FieldLabel>
                <NativeSelect
                  id="user-role"
                  onChange={(event) => setRole(event.target.value)}
                  value={role}
                >
                  {roles.map((roleRecord) => (
                    <NativeSelectOption
                      key={roleRecord.id}
                      value={roleRecord.id}
                    >
                      {roleRecord.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Button
                className="w-fit"
                disabled={busy || role === (user.role ?? "user")}
                onClick={handleSaveRole}
                type="button"
              >
                <FloppyDiskIcon data-icon="inline-start" />
                Save role
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>
              Set a new password for this user. They are not notified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="user-password">New password</FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="user-password"
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  type="password"
                  value={newPassword}
                />
              </Field>
              <Button
                className="w-fit"
                disabled={busy || newPassword.length === 0}
                onClick={handleSetPassword}
                type="button"
                variant="outline"
              >
                <KeyIcon data-icon="inline-start" />
                Set password
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>

        <DangerZoneCard
          banned={user.banned}
          busy={busy}
          isSelf={isSelf}
          onImpersonate={handleImpersonate}
          onRemove={handleRemove}
          onToggleBan={handleToggleBan}
        />
      </div>

      <SessionsCard
        busy={busy}
        onRevoke={handleRevokeSession}
        onRevokeAll={handleRevokeAll}
        sessions={sessions}
      />
    </div>
  );
};
