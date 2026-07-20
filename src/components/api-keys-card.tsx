import { CopyIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
import type { ApiKeySummary, CreatedApiKey } from "~/lib/api-key-data";
import {
  createMyApiKey,
  deleteMyApiKey,
  listMyApiKeys,
} from "~/lib/api-key-data";

interface ApiKeysCardProps {
  admin?: boolean;
  initialKeys?: ApiKeySummary[];
  onAdminDelete?: (id: string) => void;
}

export const ApiKeysCard = ({
  admin = false,
  initialKeys,
  onAdminDelete,
}: ApiKeysCardProps) => {
  const [keys, setKeys] = useState(initialKeys ?? []);
  const [name, setName] = useState("");
  const [createdKey, setCreatedKey] = useState<CreatedApiKey | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const loadKeys = async () => {
      if (admin || initialKeys) {
        return;
      }

      try {
        setKeys(await listMyApiKeys());
      } catch {
        setKeys([]);
      }
    };

    void loadKeys();
  }, [admin, initialKeys]);

  const create = async () => {
    setBusy(true);
    try {
      const result = await createMyApiKey({ data: { name } });
      setCreatedKey(result);
      setKeys((current) => [result, ...current]);
      setName("");
      toast.success(
        "API key created. Copy it now; it will not be shown again."
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create API key."
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      if (admin) {
        onAdminDelete?.(id);
      } else {
        await deleteMyApiKey({ data: id });
      }
      setKeys((current) => current.filter((key) => key.id !== id));
      toast.success("API key revoked.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to revoke API key."
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          Use a bearer API key to connect MCP clients to this application.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {admin ? null : (
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="api-key-name">Key name</FieldLabel>
              <Input
                id="api-key-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="Claude Desktop"
                value={name}
              />
            </Field>
            <Button
              className="w-fit"
              disabled={busy || !name.trim()}
              onClick={create}
              type="button"
            >
              <PlusIcon data-icon="inline-start" />
              Create API key
            </Button>
          </FieldGroup>
        )}
        {createdKey ? (
          <div className="rounded-md border border-warning bg-warning/10 p-3 text-sm">
            <p className="font-medium">Copy this secret now:</p>
            <code className="break-all">{createdKey.key}</code>
            <Button
              className="mt-2"
              onClick={() => void navigator.clipboard.writeText(createdKey.key)}
              size="sm"
              type="button"
              variant="outline"
            >
              <CopyIcon data-icon="inline-start" />
              Copy key
            </Button>
          </div>
        ) : null}
        {keys.length === 0 ? (
          <p className="text-muted-foreground text-sm">No API keys.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {keys.map((key) => (
              <div
                className="flex items-center justify-between gap-3 rounded-md border p-3"
                key={key.id}
              >
                <div className="min-w-0">
                  <p className="font-medium">{key.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {key.keyPrefix}… · created{" "}
                    {new Date(key.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  disabled={busy}
                  onClick={() => void remove(key.id)}
                  size="sm"
                  type="button"
                  variant="destructive"
                >
                  <TrashIcon data-icon="inline-start" />
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
