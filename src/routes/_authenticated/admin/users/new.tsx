// oxlint-disable no-use-before-define
import { ArrowLeftIcon, UserPlusIcon } from "@phosphor-icons/react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
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
import { createUserWithOnboarding, getRoles } from "~/lib/admin-data";

const NewUserPage = () => {
  const roles = Route.useLoaderData();
  const navigate = useNavigate();
  const createUser = useServerFn(createUserWithOnboarding);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("user");
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setIsSaving(true);
    try {
      const result = await createUser({
        data: {
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          role,
        },
      });

      if (result.onboardingEmailQueued) {
        toast.success("User created — a sign-in email is on its way.");
      } else {
        toast.warning(
          result.onboardingEmailError ??
            "User created, but the sign-in email could not be sent."
        );
      }

      await navigate({
        params: { userId: result.userId },
        to: "/admin/users/$userId",
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to create user."
      );
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
            The user gets an email to set their own password and sign in for the
            first time.
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
            We email the new user a link to choose their password. You never see
            or share it.
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
