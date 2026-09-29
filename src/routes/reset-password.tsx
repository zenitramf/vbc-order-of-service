// oxlint-disable no-use-before-define
import { ChurchIcon } from "@phosphor-icons/react";
import { Link, createFileRoute } from "@tanstack/react-router";
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
import { Spinner } from "~/components/ui/spinner";

const LOGIN_HERO_IMAGE_URL = "/vbc_logo_portal_image.webp";
const MIN_PASSWORD_LENGTH = 8;

const ResetPasswordPage = () => {
  const { error: linkError, token } = Route.useSearch();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const linkIsInvalid = Boolean(linkError) || !token;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token) {
      return;
    }

    const formData = new FormData(event.currentTarget);
    const newPassword = String(formData.get("newPassword") ?? "");
    const confirmPassword = String(formData.get("confirmPassword") ?? "");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      toast.error(
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    const { authClient } = await import("~/lib/auth-client");
    const { error } = await authClient.resetPassword({ newPassword, token });
    setIsSubmitting(false);

    if (error) {
      toast.error(
        error.message ??
          "Unable to set your password. The link may have expired."
      );
      return;
    }

    setIsDone(true);
    toast.success("Password set. You can sign in now.");
  };

  const renderBody = () => {
    if (linkIsInvalid) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Link expired or invalid</CardTitle>
            <CardDescription>
              Password links can only be used once and expire after one hour.
              Request a new one from the sign-in page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Back to sign in</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    if (isDone) {
      return (
        <Card>
          <CardHeader>
            <CardTitle>Password set</CardTitle>
            <CardDescription>
              Your new password is ready. Sign in to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild className="w-full">
              <Link to="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      );
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle>Set your password</CardTitle>
          <CardDescription>
            Choose a password for the Order of Service portal. You will use it
            to sign in for the first time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="new-password">New password</FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="new-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  name="newPassword"
                  required
                  type="password"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="confirm-password">
                  Confirm password
                </FieldLabel>
                <Input
                  autoComplete="new-password"
                  id="confirm-password"
                  minLength={MIN_PASSWORD_LENGTH}
                  name="confirmPassword"
                  required
                  type="password"
                />
              </Field>
              <Field>
                <Button disabled={isSubmitting} type="submit">
                  {isSubmitting ? <Spinner /> : "Set password"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a className="flex items-center gap-2 font-medium" href="/">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <ChurchIcon />
            </div>
            Victory Baptist Church
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">{renderBody()}</div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <div
          className="absolute inset-0 bg-center bg-cover opacity-80"
          style={{ backgroundImage: `url(${LOGIN_HERO_IMAGE_URL})` }}
        />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  validateSearch: (
    search: Record<string, unknown>
  ): { error?: string; token?: string } => ({
    error: typeof search.error === "string" ? search.error : undefined,
    token:
      typeof search.token === "string" && search.token
        ? search.token
        : undefined,
  }),
});
