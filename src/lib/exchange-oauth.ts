/**
 * Microsoft Entra access tokens via the OAuth2 client-credentials grant.
 *
 * Used for Exchange Online SMTP (SASL XOAUTH2, `SMTP.SendAsApp`) and for
 * Microsoft Graph app-only calls (for example SharePoint uploads). Tokens
 * are cached in isolate memory until shortly before expiry, keyed by tenant,
 * client, and scope so different scopes never share a cached token.
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

export const EXCHANGE_SMTP_SCOPE = "https://outlook.office365.com/.default";
export const MICROSOFT_GRAPH_SCOPE = "https://graph.microsoft.com/.default";
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

const getScopeLabel = (scope: string): string =>
  scope === EXCHANGE_SMTP_SCOPE ? "SMTP" : "Microsoft Graph";

const getTokenLabel = (scope: string): string =>
  scope === EXCHANGE_SMTP_SCOPE
    ? "an SMTP access token"
    : "a Microsoft Graph access token";

export const getMicrosoftAccessToken = async (
  credentials: ExchangeOAuthCredentials,
  scope: string
): Promise<string> => {
  const tenantId = credentials.tenantId.trim();
  const clientId = credentials.clientId.trim();
  const cacheKey = `${tenantId}\n${clientId}\n${scope}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAtMs - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return cached.accessToken;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: credentials.clientSecret,
    grant_type: "client_credentials",
    scope,
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
      `Microsoft Entra rejected the ${getScopeLabel(scope)} OAuth request (HTTP ${response.status}).${detail}`
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
    throw new Error(`Microsoft Entra did not return ${getTokenLabel(scope)}.`);
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

export const getExchangeSmtpAccessToken = (
  credentials: ExchangeOAuthCredentials
): Promise<string> => getMicrosoftAccessToken(credentials, EXCHANGE_SMTP_SCOPE);

export const getMicrosoftGraphAccessToken = (
  credentials: ExchangeOAuthCredentials
): Promise<string> =>
  getMicrosoftAccessToken(credentials, MICROSOFT_GRAPH_SCOPE);
