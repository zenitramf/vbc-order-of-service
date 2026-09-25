import { describe, expect, it } from "vitest";

import {
  resolveRickAgentTokenSubject,
  signRickAgentToken,
  verifyRickAgentToken,
} from "~/lib/rick-agent-token";

const SECRET = "test-secret-with-enough-entropy";
const NOW = Date.UTC(2026, 8, 25, 12, 0, 0);

const encode = (value: string): Uint8Array<ArrayBuffer> =>
  new TextEncoder().encode(value);

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
};

/** Build a signed token with an arbitrary payload to test audience checks. */
const signRawPayload = async (
  payload: Record<string, unknown>,
  secret: string
): Promise<string> => {
  const body = toBase64Url(encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey(
    "raw",
    encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encode(body));

  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
};

describe("rick agent token", () => {
  it("round-trips a user id", async () => {
    const token = await signRickAgentToken({
      now: NOW,
      secret: SECRET,
      userId: "user-123",
    });

    await expect(
      verifyRickAgentToken({ now: NOW + 1000, secret: SECRET, token })
    ).resolves.toMatchObject({ sub: "user-123" });
  });

  it("rejects an expired token", async () => {
    const token = await signRickAgentToken({
      now: NOW,
      secret: SECRET,
      userId: "user-123",
    });

    await expect(
      verifyRickAgentToken({
        now: NOW + 6 * 60 * 1000,
        secret: SECRET,
        token,
      })
    ).resolves.toBeNull();
  });

  it("rejects a wrong audience", async () => {
    const token = await signRawPayload(
      {
        aud: "some-other-service",
        exp: Math.floor(NOW / 1000) + 300,
        iat: Math.floor(NOW / 1000),
        sub: "user-123",
      },
      SECRET
    );

    await expect(
      verifyRickAgentToken({ now: NOW, secret: SECRET, token })
    ).resolves.toBeNull();
  });

  it("rejects a tampered signature", async () => {
    const token = await signRickAgentToken({
      now: NOW,
      secret: SECRET,
      userId: "user-123",
    });
    const tampered = `${token.slice(0, -2)}xx`;

    await expect(
      verifyRickAgentToken({ now: NOW, secret: SECRET, token: tampered })
    ).resolves.toBeNull();
  });

  it("rejects a different secret", async () => {
    const token = await signRickAgentToken({
      now: NOW,
      secret: SECRET,
      userId: "user-123",
    });

    await expect(
      resolveRickAgentTokenSubject(token, "another-secret")
    ).resolves.toBeNull();
  });

  it("rejects a missing secret and malformed tokens", async () => {
    const token = await signRickAgentToken({
      now: NOW,
      secret: SECRET,
      userId: "user-123",
    });

    // oxlint-disable-next-line unicorn/no-useless-undefined -- exercising the missing-secret path
    await expect(resolveRickAgentTokenSubject(token, undefined)).resolves.toBe(
      null
    );
    await expect(
      resolveRickAgentTokenSubject("not-a-token", SECRET)
    ).resolves.toBe(null);
  });
});
