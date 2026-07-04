// oxlint-disable no-use-before-define
import {
  LockIcon,
  PlusIcon,
  ShieldCheckIcon,
  TrashIcon,
} from "@phosphor-icons/react";
import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { deleteRole, getRoles } from "~/lib/admin-data";
import { countPermissions } from "~/lib/admin-permissions";

const RolesPage = () => {
  const roles = Route.useLoaderData();
  const router = useRouter();
  const deleteRoleFn = useServerFn(deleteRole);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const handleDelete = async (id: string, name: string) => {
    try {
      await deleteRoleFn({ data: id });
      setPendingDelete(null);
      toast.success(`Deleted "${name}".`);
      await router.invalidate();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete role."
      );
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            Roles
          </h1>
          <p className="text-muted-foreground">
            Define roles and the permissions each one grants.
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/roles/new">
            <PlusIcon data-icon="inline-start" />
            New role
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All roles</CardTitle>
          <CardDescription>
            Built-in roles can be viewed but not edited or removed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Permissions</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell>
                    <Link
                      className="flex items-center gap-2 font-medium hover:underline"
                      params={{ roleId: role.id }}
                      to="/admin/roles/$roleId"
                    >
                      <ShieldCheckIcon />
                      {role.name}
                      {role.isSystem ? (
                        <Badge variant="outline">
                          <LockIcon data-icon="inline-start" />
                          Built-in
                        </Badge>
                      ) : null}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-[24rem] text-muted-foreground">
                    {role.description || "—"}
                  </TableCell>
                  <TableCell>{countPermissions(role.permissions)}</TableCell>
                  <TableCell>{role.userCount}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link
                          params={{ roleId: role.id }}
                          to="/admin/roles/$roleId"
                        >
                          {role.isSystem ? "View" : "Edit"}
                        </Link>
                      </Button>
                      {role.isSystem ? null : (
                        <AlertDialog
                          onOpenChange={(open) =>
                            setPendingDelete(open ? role.id : null)
                          }
                          open={pendingDelete === role.id}
                        >
                          <AlertDialogTrigger asChild>
                            <Button size="sm" type="button" variant="ghost">
                              <TrashIcon data-icon="inline-start" />
                              Delete
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete this role?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                "{role.name}" will be permanently removed. Users
                                assigned this role must be reassigned first.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(role.id, role.name)}
                                variant="destructive"
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export const Route = createFileRoute("/_authenticated/admin/roles/")({
  component: RolesPage,
  loader: () => getRoles(),
});
