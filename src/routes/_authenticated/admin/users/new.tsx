// oxlint-disable no-use-before-define
import { ArrowLeftIcon, UserPlusIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import type { FormEvent } from "react";
import { useState } from "react";
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
import {
  NativeSelect,
  NativeSelectOption,
} from "~/components/ui/native-select";
import { getRoles } from "~/lib/admin-data";
import { authClient } from "~/lib/auth-client";

const NewUserPage = () => {
  const roles = Route.useLoaderData();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("user");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const computedName = `${trimmedFirstName} ${trimmedLastName}`.trim();

    setIsSaving(true);
    try {
      const { data, error } = await authClient.admin.createUser({
        data: {
          firstName: trimmedFirstName,
          lastName: trimmedLastName,
        },
        email: email.trim(),
        name: computedName,
        password,
        role: role as string,
      });

      if (error) {
        toast.error(error.message ?? "Unable to create user.");
        return;
      }

      toast.success("User created.");

      const createdId = data?.user?.id;
      await (createdId
        ? navigate({
            params: { userId: createdId },
            to: "/admin/users/$userId",
          })
        : navigate({ to: "/admin/users" }));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex flex-col gap-2">
          <Button asChild className="w-fit px-0" size="sm" variant="link">
            <Link to="/admin/users">
              <ArrowLeftIcon data-icon="inline-start" />
              Back to users
            </Link>
          </Button>
          <h1 className="font-heading font-semibold text-3xl tracking-tight">
            New user
          </h1>
          <p className="text-muted-foreground">
            Create an account with an email and password.
          </p>
        </div>
        <Button disabled={isSaving} type="submit">
          <UserPlusIcon data-icon="inline-start" />
          {isSaving ? "Creating…" : "Create user"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account details</CardTitle>
          <CardDescription>
            The user can sign in immediately with these credentials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="md:grid md:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="new-user-first-name">First name</FieldLabel>
              <Input
                id="new-user-first-name"
                onChange={(event) => setFirstName(event.target.value)}
                required
                value={firstName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-last-name">Last name</FieldLabel>
              <Input
                id="new-user-last-name"
                onChange={(event) => setLastName(event.target.value)}
                required
                value={lastName}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-email">Email</FieldLabel>
              <Input
                id="new-user-email"
                onChange={(event) => setEmail(event.target.value)}
                required
                type="email"
                value={email}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-password">Password</FieldLabel>
              <Input
                autoComplete="new-password"
                id="new-user-password"
                onChange={(event) => setPassword(event.target.value)}
                placeholder="At least 8 characters"
                required
                type="password"
                value={password}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="new-user-role">Role</FieldLabel>
              <NativeSelect
                id="new-user-role"
                onChange={(event) => setRole(event.target.value)}
                value={role}
              >
                {roles.map((roleRecord) => (
                  <NativeSelectOption key={roleRecord.id} value={roleRecord.id}>
                    {roleRecord.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
    </form>
  );
};

export const Route = createFileRoute("/_authenticated/admin/users/new")({
  component: NewUserPage,
  loader: () => getRoles(),
});
