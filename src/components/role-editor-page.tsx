// oxlint-disable no-use-before-define
import { ArrowLeftIcon, FloppyDiskIcon, LockIcon } from "@phosphor-icons/react";
import { Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { saveRole } from "~/lib/admin-data";
import type { RolePermissions, RoleRecord } from "~/lib/admin-permissions";
import {
  isWildcard,
  PERMISSION_RESOURCES,
  hasPermission as permissionGranted,
} from "~/lib/admin-permissions";

interface RoleEditorPageProps {
  role?: RoleRecord;
}

export const RoleEditorPage = ({ role }: RoleEditorPageProps) => {
  const navigate = useNavigate();
  const router = useRouter();
  const saveRoleFn = useServerFn(saveRole);

  const readOnly = role?.isSystem ?? false;
  const wildcard = role ? isWildcard(role.permissions) : false;

  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [permissions, setPermissions] = useState<RolePermissions>(
    role?.permissions ?? {}
  );
  const [isSaving, setIsSaving] = useState(false);

  const toggle = (resource: string, action: string, checked: boolean) => {
    setPermissions((current) => {
      const actions = new Set(current[resource]);

      if (checked) {
        actions.add(action);
      } else {
        actions.delete(action);
      }

      const next: RolePermissions = {};

      for (const [key, value] of Object.entries(current)) {
        if (key !== resource) {
          next[key] = value;
        }
      }

      if (actions.size > 0) {
        next[resource] = [...actions];
      }

      return next;
    });
  };

  const isChecked = (resource: string, action: string): boolean => {
    if (wildcard) {
      return true;
    }

    return permissionGranted(permissions, resource, action);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Role name is required.");
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveRoleFn({
        data: { description, id: role?.id, name, permissions },
      });
      toast.success("Role saved.");
      await router.invalidate();
      await navigate({
        params: { roleId: result.id },
        to: "/admin/roles/$roleId",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save role."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Button asChild className="w-fit px-0" size="sm" variant="link">
            <Link to="/admin/roles">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to roles
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 font-heading font-semibold text-3xl tracking-tight">
            {role ? role.name : "New role"}
            {readOnly ? (
              <Badge variant="outline">
                <LockIcon data-icon="inline-start" />
                Built-in
              </Badge>
            ) : null}
          </h1>
          <p className="text-muted-foreground">
            {readOnly
              ? "Built-in roles are provided by the system and can only be viewed."
              : "Define what users with this role are allowed to do."}
          </p>
        </div>
        {readOnly ? null : (
          <Button disabled={isSaving} onClick={handleSubmit} type="button">
            <FloppyDiskIcon data-icon="inline-start" />
            {isSaving ? "Saving…" : "Save role"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>Name and description for this role.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="role-name">Name</FieldLabel>
              <Input
                disabled={readOnly}
                id="role-name"
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Worship Leader"
                value={name}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="role-description">Description</FieldLabel>
              <Textarea
                disabled={readOnly}
                id="role-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this role is for…"
                rows={3}
                value={description}
              />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
          <CardDescription>
            {wildcard
              ? "This role has full access to every area."
              : "Select what this role can do in each area."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {PERMISSION_RESOURCES.map((resource) => (
            <div className="flex flex-col gap-2" key={resource.key}>
              <p className="font-medium text-sm">{resource.label}</p>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {resource.actions.map((action) => (
                  <Label
                    className="flex items-center gap-2 font-normal capitalize"
                    key={action}
                  >
                    <Checkbox
                      checked={isChecked(resource.key, action)}
                      disabled={readOnly || wildcard}
                      onCheckedChange={(checked) =>
                        toggle(resource.key, action, checked === true)
                      }
                    />
                    {action}
                  </Label>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};
