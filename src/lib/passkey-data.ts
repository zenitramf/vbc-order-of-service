import { getAuthenticatorName } from "@better-auth/passkey";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getAppDb } from "~/db/client";
import { passkey } from "~/db/schema";
import { createAuth } from "~/lib/auth";

/**
 * Passkey management server functions.
 *
 * Passkey rows are private user data, so every read/mutation happens on the
 * server behind a session (self-service) or an admin guard (managing another
 * user). The client never sees the `publicKey`, `credentialID`, or session
 * tokens — only the safe summary below. The WebAuthn ceremonies themselves
 * (registering with `addPasskey` and signing in) must run in the browser and
 * are handled directly by the Better Auth passkey client.
 */

export interface PasskeySummary {
  aaguid: string | null;
  /** Human-readable authenticator model resolved from the AAGUID. */
  authenticatorName: string;
  backedUp: boolean;
  createdAt: string;
  deviceType: string;
  id: string;
  /** What to show in the UI: the user's name, or the authenticator fallback. */
  label: string;
  /** The stored (user-editable) name; empty when never named. */
  name: string;
  transports: string | null;
}

interface PasskeyRow {
  aaguid?: string | null;
  backedUp: boolean | number;
  createdAt?: Date | string | null;
  deviceType: string;
  id: string;
  name?: string | null;
  transports?: string | null;
}

const toIso = (value: Date | string | null | undefined): string => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }

  return "";
};

/**
 * A display label for the authenticator: its model name (via the AAGUID map
 * Better Auth ships) or a generic fallback keyed on whether the credential is
 * device-bound or syncable.
 */
const authenticatorLabel = (
  aaguid: string | null | undefined,
  deviceType: string
): string =>
  getAuthenticatorName(aaguid) ??
  (deviceType === "singleDevice" ? "Security key" : "Passkey");

const toSummary = (row: PasskeyRow): PasskeySummary => {
  const authenticatorName = authenticatorLabel(row.aaguid, row.deviceType);
  const name = row.name ?? "";

  return {
    aaguid: row.aaguid ?? null,
    authenticatorName,
    backedUp: Boolean(row.backedUp),
    createdAt: toIso(row.createdAt),
    deviceType: row.deviceType,
    id: row.id,
    label: name || authenticatorName,
    name,
    transports: row.transports ?? null,
  };
};

const idInput = z.object({ id: z.string().min(1) });
const renameInput = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(64),
});
const userIdInput = z.object({ userId: z.string().min(1) });
const deletePasskeyAdminInput = z.object({
  passkeyId: z.string().min(1),
  userId: z.string().min(1),
});

const requireAdmin = async () => {
  const headers = getRequestHeaders();
  const session = await createAuth(env).api.getSession({ headers });

  if (!session || session.user.role !== "admin") {
    throw new Error("You do not have permission to manage passkeys.");
  }

  return session;
};

/** The signed-in user's own passkeys. */
export const listMyPasskeys = createServerFn({ method: "GET" }).handler(
  async (): Promise<PasskeySummary[]> => {
    const headers = getRequestHeaders();
    const auth = createAuth(env);
    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new Error("Unauthorized");
    }

    const passkeys = await auth.api.listPasskeys({ headers });

    return passkeys.map((row) => toSummary(row));
  }
);

/** Rename one of the caller's own passkeys (ownership enforced by Better Auth). */
export const renameMyPasskey = createServerFn({ method: "POST" })
  .validator((data) => renameInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    const headers = getRequestHeaders();
    await createAuth(env).api.updatePasskey({
      body: { id: data.id, name: data.name },
      headers,
    });

    return { success: true };
  });

/** Delete one of the caller's own passkeys. */
export const deleteMyPasskey = createServerFn({ method: "POST" })
  .validator((data) => idInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    const headers = getRequestHeaders();
    await createAuth(env).api.deletePasskey({
      body: { id: data.id },
      headers,
    });

    return { success: true };
  });

/**
 * Give a freshly-registered passkey a default name derived from the
 * authenticator model, but only when the user hasn't named it themselves.
 * Called right after `addPasskey` so every passkey lands with a sensible label.
 */
export const applyDefaultPasskeyName = createServerFn({ method: "POST" })
  .validator((data) => idInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    const headers = getRequestHeaders();
    const auth = createAuth(env);
    const session = await auth.api.getSession({ headers });

    if (!session) {
      throw new Error("Unauthorized");
    }

    const row = await getAppDb()
      .select({
        aaguid: passkey.aaguid,
        deviceType: passkey.deviceType,
        name: passkey.name,
      })
      .from(passkey)
      .where(and(eq(passkey.id, data.id), eq(passkey.userId, session.user.id)))
      .get();

    if (!row) {
      throw new Error("Passkey not found.");
    }

    // Better Auth defaults an unnamed passkey to the user's email; treat that
    // (and an empty name) as "not yet named" so we can apply a nicer default.
    const currentName = (row.name ?? "").trim();
    const isUnnamed =
      currentName.length === 0 || currentName === session.user.email;

    if (isUnnamed) {
      await auth.api.updatePasskey({
        body: {
          id: data.id,
          name: authenticatorLabel(row.aaguid, row.deviceType),
        },
        headers,
      });
    }

    return { success: true };
  });

/** Admin: list the passkeys registered by a specific user. */
export const listUserPasskeysAdmin = createServerFn({ method: "GET" })
  .validator((data) => userIdInput.parse(data))
  .handler(async ({ data }): Promise<PasskeySummary[]> => {
    await requireAdmin();

    const rows = await getAppDb()
      .select({
        aaguid: passkey.aaguid,
        backedUp: passkey.backedUp,
        createdAt: passkey.createdAt,
        deviceType: passkey.deviceType,
        id: passkey.id,
        name: passkey.name,
        transports: passkey.transports,
      })
      .from(passkey)
      .where(eq(passkey.userId, data.userId))
      .orderBy(desc(passkey.createdAt))
      .all();

    return rows.map((row) => toSummary(row));
  });

/** Admin: revoke a specific user's passkey. */
export const deleteUserPasskeyAdmin = createServerFn({ method: "POST" })
  .validator((data) => deletePasskeyAdminInput.parse(data))
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();

    await getAppDb()
      .delete(passkey)
      .where(
        and(eq(passkey.id, data.passkeyId), eq(passkey.userId, data.userId))
      );

    return { success: true };
  });
