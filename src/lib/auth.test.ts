import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMicrosoftSocialProviderConfig,
  createAuth,
  mapMicrosoftProfileToUser,
} from "~/lib/auth";
import type { ExchangeOAuthCredentials } from "~/lib/exchange-oauth";

const credentialsState = vi.hoisted(() => ({
  credentials: null as ExchangeOAuthCredentials | null,
}));

vi.mock("~/lib/email-sender", () => ({
  getMicrosoftGraphCredentials: () =>
    Promise.resolve(credentialsState.credentials),
}));

afterEach(() => {
  credentialsState.credentials = null;
});

describe("mapMicrosoftProfileToUser", () => {
  it("maps standard Microsoft Entra claims and strips large base64 profile photos", () => {
    expect(
      mapMicrosoftProfileToUser({
        email: "Jane.Doe@VbcFresno.org",
        family_name: "Doe",
        given_name: "Jane",
        name: "Jane Doe",
        picture: "data:image/jpeg;base64, /9j/4AAQSkZJRgABAQAAAQABAAD...",
      })
    ).toEqual({
      email: "jane.doe@vbcfresno.org",
      emailVerified: true,
      firstName: "Jane",
      image: undefined,
      lastName: "Doe",
      name: "Jane Doe",
    });
  });

  it("falls back to preferred_username or upn when Entra omits the email claim", () => {
    expect(
      mapMicrosoftProfileToUser({
        family_name: "Smith",
        given_name: "John",
        preferred_username: "john.smith@vbcfresno.org",
      })
    ).toEqual({
      email: "john.smith@vbcfresno.org",
      emailVerified: true,
      firstName: "John",
      image: undefined,
      lastName: "Smith",
      name: "John Smith",
    });

    expect(
      mapMicrosoftProfileToUser({
        name: "Mary Johnson",
        upn: "mary@vbcfresno.org",
      })
    ).toEqual({
      email: "mary@vbcfresno.org",
      emailVerified: true,
      firstName: "Mary",
      image: undefined,
      lastName: "Johnson",
      name: "Mary Johnson",
    });
  });

  it("splits display name when given_name and family_name are absent", () => {
    expect(
      mapMicrosoftProfileToUser({
        email: "pastor@vbcfresno.org",
        name: "David Lee Miller",
      })
    ).toEqual({
      email: "pastor@vbcfresno.org",
      emailVerified: true,
      firstName: "David",
      image: undefined,
      lastName: "Lee Miller",
      name: "David Lee Miller",
    });
  });

  it("handles single-word display names and missing names gracefully", () => {
    expect(
      mapMicrosoftProfileToUser({
        email: "office@vbcfresno.org",
        name: "Office",
      })
    ).toEqual({
      email: "office@vbcfresno.org",
      emailVerified: true,
      firstName: "Office",
      image: undefined,
      lastName: "",
      name: "Office",
    });

    expect(
      mapMicrosoftProfileToUser({
        email: "media@vbcfresno.org",
      })
    ).toEqual({
      email: "media@vbcfresno.org",
      emailVerified: true,
      firstName: "media",
      image: undefined,
      lastName: "",
      name: "media",
    });
  });
});

describe("buildMicrosoftSocialProviderConfig", () => {
  it("disables the Microsoft provider when Entra credentials are not configured", () => {
    expect(buildMicrosoftSocialProviderConfig(null)).toEqual({
      clientId: "",
      enabled: false,
    });
  });

  it("configures the Microsoft Entra provider from resolved credentials", () => {
    const config = buildMicrosoftSocialProviderConfig({
      clientId: "entra-client-id",
      clientSecret: "entra-client-secret",
      tenantId: "entra-tenant-id",
    });

    expect(config).toEqual({
      authority: "https://login.microsoftonline.com",
      clientId: "entra-client-id",
      clientSecret: "entra-client-secret",
      disableProfilePhoto: true,
      enabled: true,
      mapProfileToUser: mapMicrosoftProfileToUser,
      prompt: "select_account",
      tenantId: "entra-tenant-id",
    });
  });
});

describe("createAuth Microsoft social provider context", () => {
  const testEnv = {
    BETTER_AUTH_SECRET: "0123456789abcdef0123456789abcdef",
    BETTER_AUTH_URL: "https://oos.vbcfresno.org",
    DB: {},
  } as unknown as Env;

  it("registers the Microsoft social provider when Entra credentials resolve", async () => {
    credentialsState.credentials = {
      clientId: "entra-client-id",
      clientSecret: "entra-client-secret",
      tenantId: "entra-tenant-id",
    };

    const authInstance = createAuth(testEnv);
    const context = await authInstance.$context;
    const microsoftProvider = context.socialProviders.find(
      (provider) => provider.id === "microsoft"
    );

    expect(microsoftProvider).toBeDefined();
    expect(context.trustedProviders).toContain("microsoft");

    const authUrl = await microsoftProvider?.createAuthorizationURL({
      codeVerifier: "test-code-verifier",
      redirectURI: "https://oos.vbcfresno.org/api/auth/callback/microsoft",
      state: "test-state",
    });

    expect(authUrl?.origin).toBe("https://login.microsoftonline.com");
    expect(authUrl?.pathname).toBe("/entra-tenant-id/oauth2/v2.0/authorize");
    expect(authUrl?.searchParams.get("client_id")).toBe("entra-client-id");
    expect(authUrl?.searchParams.get("prompt")).toBe("select_account");
    expect(authUrl?.searchParams.get("redirect_uri")).toBe(
      "https://oos.vbcfresno.org/api/auth/callback/microsoft"
    );
  });

  it("omits the Microsoft social provider when no Entra credentials exist", async () => {
    credentialsState.credentials = null;

    const authInstance = createAuth(testEnv);
    const context = await authInstance.$context;
    const microsoftProvider = context.socialProviders.find(
      (provider) => provider.id === "microsoft"
    );

    expect(microsoftProvider).toBeUndefined();
  });
});
