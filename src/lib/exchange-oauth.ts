/**
 * Microsoft Entra access tokens for Exchange Online SMTP (SASL XOAUTH2).
 *
 * Uses the OAuth2 client-credentials grant against the tenant token endpoint
 * with the `SMTP.SendAsApp` application permission. Tokens are cached in
 * isolate memory until shortly before expiry so queued sends rarely pay for a
 * token request.
 */

export interface ExchangeOAuthCredentials {
  clientId: string;
  clientSecret: string;
  tenantId: string;
}

interface CachedToken {
  accessToken: string;
  expiresAtMs: number;
}

const EXCHANGE_SMTP_SCOPE = "https://outlook.office365.com/.default";
/** Refresh tokens expiring within this window so sends never use a stale one. */
const TOKEN_REFRESH_SKEW_MS = 5 * 60 * 1000;
const FALLBACK_TOKEN_TTL_SECONDS = 3600;

const tokenCache = new Map<string, CachedToken>();

/** Visible for testing. */
export const clearExchangeOAuthCache = (): void => {
  tokenCache.clear();
};

const readTokenErrorDetail = async (response: Response): Promise<string> => {
  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const error = typeof payload?.error === "string" ? payload.error : "";
  const description =
    typeof payload?.error_description === "string"
      ? payload.error_description.slice(0, 300)
      : "";
  const detail = [error, description].filter(Boolean).join(": ");

  return detail ? ` ${detail}` : "";
};

export const getExchangeSmtpAccessToken = async (
  credentials: ExchangeOAuthCredentials
): Promise<string> => {
  const tenantId = credentials.tenantId.trim();
  const clientId = credentials.clientId.trim();
  const cacheKey = `${tenantId}\n${clientId}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAtMs - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
    scope: EXCHANGE_SMTP_SCOPE,
  });
  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      body,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      method: "POST",
    }
  );

  if (!response.ok) {
    const detail = await readTokenErrorDetail(response);
    throw new Error(
      `Microsoft Entra rejected the SMTP OAuth request (HTTP ${response.status}).${detail}`
    );
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };

  if (
    typeof payload.access_token !== "string" ||
    payload.access_token.length === 0
  ) {
    throw new Error("Microsoft Entra did not return an SMTP access token.");
  }

  const ttlSeconds =
    typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : FALLBACK_TOKEN_TTL_SECONDS;
  tokenCache.set(cacheKey, {
    accessToken: payload.access_token,
    expiresAtMs: Date.now() + ttlSeconds * 1000,
  });

  return payload.access_token;
};
