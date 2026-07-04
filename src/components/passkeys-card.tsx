import {
  CheckIcon,
  FingerprintIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from "@phosphor-icons/react";
import { useState } from "react";

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
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import type { PasskeySummary } from "~/lib/passkey-data";

interface PasskeysCardProps {
  adding?: boolean;
  busy: boolean;
  description?: string;
  /** Omit to hide the "Add passkey" button (e.g. the admin view). */
  onAdd?: () => void;
  onDelete: (id: string) => void;
  /** Omit to make the list read-only for names (e.g. the admin view). */
  onRename?: (id: string, name: string) => Promise<void> | void;
  passkeys: PasskeySummary[];
}

const formatDate = (value: string): string => {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? "—"
    : new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(date);
};

export const PasskeysCard = ({
  adding = false,
  busy,
  description = "Passkeys let you sign in with your fingerprint, face, screen lock, or a security key instead of a password.",
  onAdd,
  onDelete,
  onRename,
  passkeys,
}: PasskeysCardProps) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");

  const startEdit = (passkey: PasskeySummary) => {
    setEditingId(passkey.id);
    setDraftName(passkey.name || passkey.authenticatorName);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraftName("");
  };

  const commitEdit = async (id: string) => {
    const name = draftName.trim();

    if (!(name && onRename)) {
      cancelEdit();
      return;
    }

    await onRename(id, name);
    cancelEdit();
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Passkeys</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          {onAdd ? (
            <Button
              disabled={busy}
              onClick={onAdd}
              size="sm"
              type="button"
              variant="outline"
            >
              {adding ? <Spinner /> : <PlusIcon data-icon="inline-start" />}
              Add passkey
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {passkeys.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No passkeys registered yet.
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {passkeys.map((passkey) => {
              const isEditing = editingId === passkey.id;

              return (
                <li
                  className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  key={passkey.id}
                >
                  <FingerprintIcon
                    className="size-5 shrink-0 text-muted-foreground"
                    weight="duotone"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    {isEditing ? (
                      <Input
                        autoFocus
                        className="h-8"
                        maxLength={64}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void commitEdit(passkey.id);
                          }

                          if (event.key === "Escape") {
                            cancelEdit();
                          }
                        }}
                        value={draftName}
                      />
                    ) : (
                      <span className="truncate font-medium">
                        {passkey.label}
                      </span>
                    )}
                    <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
                      <span>{passkey.authenticatorName}</span>
                      <span aria-hidden>·</span>
                      <span>Added {formatDate(passkey.createdAt)}</span>
                      <Badge variant="outline">
                        {passkey.backedUp ? "Synced" : "Device-bound"}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          aria-label="Save name"
                          disabled={busy || draftName.trim().length === 0}
                          onClick={() => void commitEdit(passkey.id)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <CheckIcon />
                        </Button>
                        <Button
                          aria-label="Cancel"
                          disabled={busy}
                          onClick={cancelEdit}
                          size="icon"
                          type="button"
                          variant="ghost"
                        >
                          <XIcon />
                        </Button>
                      </>
                    ) : (
                      <>
                        {onRename ? (
                          <Button
                            aria-label="Rename passkey"
                            disabled={busy}
                            onClick={() => startEdit(passkey)}
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <PencilSimpleIcon />
                          </Button>
                        ) : null}
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              aria-label="Delete passkey"
                              disabled={busy}
                              size="icon"
                              type="button"
                              variant="ghost"
                            >
                              <TrashIcon />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this passkey?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                “{passkey.label}” will no longer be able to sign
                                in. This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => onDelete(passkey.id)}
                                variant="destructive"
                              >
                                Delete passkey
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
