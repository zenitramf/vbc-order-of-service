/**
 * Short-lived HMAC tokens minted by the Rick agent Durable Object and verified
 * by the portal's `/api/mcp` endpoint. The token is the only credential the
 * sidecar Worker uses to call the portal as a signed-in user, so it must stay
 * small, dependency-free, and identical on both sides of the wire.
 *
 * The sidecar imports this module to sign; the main app imports it to verify.
 */

const TOKEN_AUDIENCE = "rick-mcp";
const TOKEN_TTL_SECONDS = 300;

export interface RickAgentTokenPayload {
  aud: string;
  exp: number;
  iat: number;
  sub: string;
}

export interface SignRickAgentTokenOptions {
  now?: number;
  secret: string;
  userId: string;
}

export interface VerifyRickAgentTokenOptions {
  now?: number;
  secret: string;
  token: string;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const bytesToBase64Url = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

const base64UrlToBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }

  return bytes;
};

const importHmacKey = (secret: string): Promise<CryptoKey> =>
  crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"]
  );

const isRickAgentTokenPayload = (
  value: unknown
): value is RickAgentTokenPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const payload = value as Partial<RickAgentTokenPayload>;

  return (
    typeof payload.aud === "string" &&
    typeof payload.exp === "number" &&
    typeof payload.iat === "number" &&
    typeof payload.sub === "string" &&
    payload.sub.length > 0
  );
};

/** Mint a token that lets the sidecar call `/api/mcp` as `userId`. */
export const signRickAgentToken = async ({
  now = Date.now(),
  secret,
  userId,
}: SignRickAgentTokenOptions): Promise<string> => {
  const issuedAt = Math.floor(now / 1000);
  const payload: RickAgentTokenPayload = {
    aud: TOKEN_AUDIENCE,
    exp: issuedAt + TOKEN_TTL_SECONDS,
    iat: issuedAt,
    sub: userId,
  };
  const body = bytesToBase64Url(textEncoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(body)
  );

  return `${body}.${bytesToBase64Url(new Uint8Array(signature))}`;
};

/** Verify a token and return its payload, or `null` when it is not valid. */
export const verifyRickAgentToken = async ({
  now = Date.now(),
  secret,
  token,
}: VerifyRickAgentTokenOptions): Promise<RickAgentTokenPayload | null> => {
  const [body, signature] = token.split(".");

  if (!(body && signature)) {
    return null;
  }

  let valid: boolean;

  try {
    const key = await importHmacKey(secret);
    valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(signature),
      textEncoder.encode(body)
    );
  } catch {
    return null;
  }

  if (!valid) {
    return null;
  }

  try {
    const payload: unknown = JSON.parse(
      textDecoder.decode(base64UrlToBytes(body))
    );

    if (!isRickAgentTokenPayload(payload)) {
      return null;
    }

    if (payload.aud !== TOKEN_AUDIENCE || payload.exp * 1000 <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
};

/** Resolve the token's `sub` claim, or `null` when the token is not valid. */
export const resolveRickAgentTokenSubject = async (
  token: string,
  secret: string | undefined
): Promise<string | null> => {
  if (!secret) {
    return null;
  }

  const payload = await verifyRickAgentToken({ secret, token });

  return payload?.sub ?? null;
};
