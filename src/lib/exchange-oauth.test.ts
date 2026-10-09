import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearExchangeOAuthCache,
  getExchangeSmtpAccessToken,
} from "~/lib/exchange-oauth";

const CREDENTIALS = {
  clientId: "client-id",
  clientSecret: "super-secret-value",
  tenantId: "tenant-id",
};

const jsonResponse = (payload: unknown, status = 200) =>
  Response.json(payload, { status });

afterEach(() => {
  clearExchangeOAuthCache();
  vi.unstubAllGlobals();
});

describe("exchange oauth", () => {
  it("requests a token from the tenant endpoint", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ access_token: "token-1", expires_in: 3599 })
      );
    vi.stubGlobal("fetch", fetchMock);

    const token = await getExchangeSmtpAccessToken(CREDENTIALS);

    expect(token).toBe("token-1");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token"
    );
    expect(init.method).toBe("POST");
    const body = new URLSearchParams(init.body as string);
    expect(body.get("grant_type")).toBe("client_credentials");
    expect(body.get("client_id")).toBe("client-id");
    expect(body.get("client_secret")).toBe("super-secret-value");
    expect(body.get("scope")).toBe("https://outlook.office365.com/.default");
  });

  it("caches the token until it is close to expiry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "token-1", expires_in: 3599 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "token-2", expires_in: 3599 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "token-1"
    );
    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "token-1"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    clearExchangeOAuthCache();
    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "token-2"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes tokens that expire within the skew window", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "short-lived", expires_in: 60 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "fresh", expires_in: 3599 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "short-lived"
    );
    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "fresh"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps separate cache entries per application", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "token-a", expires_in: 3599 })
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "token-b", expires_in: 3599 })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "token-a"
    );
    await expect(
      getExchangeSmtpAccessToken({ ...CREDENTIALS, clientId: "other-app" })
    ).resolves.toBe("token-b");
    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).resolves.toBe(
      "token-a"
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws a descriptive error without leaking the secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: "invalid_client",
          error_description: "Client secret has expired.",
        },
        401
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getExchangeSmtpAccessToken(CREDENTIALS).catch(
      (error: unknown) => error
    );

    expect(result).toBeInstanceOf(Error);
    expect((result as Error).message).toContain("HTTP 401");
    expect((result as Error).message).toContain("invalid_client");
    expect((result as Error).message).toContain("Client secret has expired.");
    expect((result as Error).message).not.toContain("super-secret-value");
  });

  it("throws when the response has no access token", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ expires_in: 3599 }))
    );

    await expect(getExchangeSmtpAccessToken(CREDENTIALS)).rejects.toThrow(
      "did not return an SMTP access token"
    );
  });
});
