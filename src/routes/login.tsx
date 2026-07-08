import { ChurchIcon, FingerprintIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps, FormEvent } from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

const HOME_PATH = "/";
const TEMPORARY_LOGIN_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/b/bf/Downtown_Fresno_Skyline_2021.jpg";

type LoginFormProps = ComponentProps<"form"> & {
  isSubmitting: boolean;
  onPasskeySignIn: () => void;
};

const LoginForm = ({
  className,
  isSubmitting,
  onPasskeySignIn,
  ...props
}: LoginFormProps) => (
  <form className={cn("flex flex-col gap-6", className)} {...props}>
    <FieldGroup>
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="font-bold text-2xl">Login to your account</h1>
        <p className="text-balance text-muted-foreground text-sm">
          Enter your email below to login to your account
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        {/* `webauthn` opts the field into passkey autofill (conditional UI). */}
        <Input
          autoCapitalize="none"
          autoComplete="username webauthn"
          id="email"
          name="email"
          placeholder="me@example.com"
          required
          type="email"
        />
      </Field>
      <Field>
        <div className="flex items-center">
          <FieldLabel htmlFor="password">Password</FieldLabel>
          {/*<button
            className="ml-auto text-sm underline-offset-4 hover:underline"
            type="button"
          >
            Forgot your password?
          </button>*/}
        </div>
        <Input
          autoComplete="current-password webauthn"
          id="password"
          minLength={8}
          name="password"
          required
          type="password"
        />
      </Field>
      <Field>
        <Button disabled={isSubmitting} type="submit">
          {isSubmitting ? <Spinner /> : "Login"}
        </Button>
      </Field>
      <FieldSeparator>Or</FieldSeparator>
      <Field>
        <Button
          disabled={isSubmitting}
          onClick={onPasskeySignIn}
          type="button"
          variant="outline"
        >
          <FingerprintIcon data-icon="inline-start" />
          Sign in with a passkey
        </Button>
      </Field>
    </FieldGroup>
  </form>
);

interface ConditionalMediationCapable {
  isConditionalMediationAvailable?: () => Promise<boolean>;
}

export const LoginPage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Conditional UI: if the browser supports it, preload passkeys so they surface
  // in the email field's autofill dropdown. Selecting one signs the user in
  // without a password. Errors (including the user ignoring the prompt) are
  // swallowed — this is an enhancement layered on top of the password form.
  useEffect(() => {
    let cancelled = false;

    const preloadPasskeys = async () => {
      if (typeof window === "undefined" || !window.PublicKeyCredential) {
        return;
      }

      const credential =
        window.PublicKeyCredential as unknown as ConditionalMediationCapable;

      if (typeof credential.isConditionalMediationAvailable !== "function") {
        return;
      }

      const available = await credential.isConditionalMediationAvailable();

      if (!available || cancelled) {
        return;
      }

      const { authClient } = await import("~/lib/auth-client");
      const { data } = await authClient.signIn.passkey({ autoFill: true });

      if (data && !cancelled) {
        window.location.assign(HOME_PATH);
      }
    };

    void preloadPasskeys();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const { authClient } = await import("~/lib/auth-client");
    const { error } = await authClient.signIn.email({ email, password });

    if (error) {
      setIsSubmitting(false);
      toast.error(error.message ?? "Sign-in failed. Please try again.");
      return;
    }

    window.location.assign(HOME_PATH);
  };

  const handlePasskeySignIn = async () => {
    setIsSubmitting(true);
    const { authClient } = await import("~/lib/auth-client");
    const { data, error } = await authClient.signIn.passkey();

    if (error) {
      setIsSubmitting(false);
      toast.error(error.message ?? "Passkey sign-in failed. Please try again.");
      return;
    }

    if (data) {
      window.location.assign(HOME_PATH);
      return;
    }

    setIsSubmitting(false);
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
          <div className="w-full max-w-xs">
            <LoginForm
              isSubmitting={isSubmitting}
              onPasskeySignIn={handlePasskeySignIn}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
      <div className="relative hidden bg-muted lg:block">
        <img
          alt="Church sanctuary with warm light"
          className="absolute inset-0 h-full w-full object-cover opacity-80"
          src={TEMPORARY_LOGIN_IMAGE_URL}
        />
      </div>
    </div>
  );
};

export const Route = createFileRoute("/login")({
  component: LoginPage,
  loader: async () => {
    await import("~/lib/auth-client");
  },
});
