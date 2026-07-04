import { ChurchIcon } from "@phosphor-icons/react";
import { createFileRoute } from "@tanstack/react-router";
import type { ComponentProps, FormEvent } from "react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "~/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "~/components/ui/field";
import { Input } from "~/components/ui/input";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";

const HOME_PATH = "/";
const TEMPORARY_LOGIN_IMAGE_URL =
  "https://upload.wikimedia.org/wikipedia/commons/b/bf/Downtown_Fresno_Skyline_2021.jpg";

type LoginFormProps = ComponentProps<"form"> & {
  isSubmitting: boolean;
};

const LoginForm = ({ className, isSubmitting, ...props }: LoginFormProps) => (
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
        <Input
          autoCapitalize="none"
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
      {/*<FieldSeparator>Or continue with</FieldSeparator>*/}
      {/*<Field>
        <Button disabled type="button" variant="outline">
          Login with GitHub
        </Button>
        <FieldDescription className="text-center">
          Don&apos;t have an account?{" "}
          <button className="underline underline-offset-4" type="button">
            Sign up
          </button>
        </FieldDescription>
      </Field>*/}
    </FieldGroup>
  </form>
);

export const LoginPage = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);

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
            <LoginForm isSubmitting={isSubmitting} onSubmit={handleSubmit} />
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
