import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";

import { getAppDb } from "~/db/client";
import { roles, user } from "~/db/schema";
import type { RolePermissions } from "~/lib/admin-permissions";
import { parsePermissions } from "~/lib/admin-permissions";
import { createAuth } from "~/lib/auth";
import { isValidEmail } from "~/lib/teams-logic";

const readSession = async () => {
  const headers = getRequestHeaders();
  return await createAuth(env).api.getSession({ headers });
};

/** Resolve the permission matrix granted by a role id (empty if unknown). */
const resolveRolePermissions = async (
  roleId: string | null | undefined
): Promise<RolePermissions> => {
  if (!roleId) {
    return {};
  }

  const row = await getAppDb()
    .select({ permissions: roles.permissions })
    .from(roles)
    .where(eq(roles.id, roleId))
    .get();

  return row ? parsePermissions(row.permissions) : {};
};

export const getSession = createServerFn({ method: "GET" }).handler(
  readSession
);

interface SessionWithPermissions {
  permissions: RolePermissions;
  session: Awaited<ReturnType<typeof readSession>>;
}

/**
 * Session plus the resolved permission matrix for the signed-in user's role.
 * Used by the `_authenticated` layout so every route/component can gate on
 * per-resource permissions (see ~/lib/route-guards).
 */
export const getSessionWithPermissions = createServerFn({
  method: "GET",
}).handler(async (): Promise<SessionWithPermissions> => {
  const session = await readSession();

  if (!session) {
    return { permissions: {}, session: null };
  }

  return {
    permissions: await resolveRolePermissions(session.user.role),
    session,
  };
});

export const ensureSession = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await readSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    return session;
  }
);

export interface UpdateOwnProfileInput {
  email: string;
  firstName: string;
  lastName: string;
}

/**
 * Update the signed-in user's own first/last name and email. Scoped to the
 * caller's session so it can be called from the account dialog without admin
 * rights. The display `name` column is derived from first + last name (kept in
 * sync the same way the admin editor does it). Writes the `user` row directly
 * (the app has no email-verification flow) and surfaces the unique-email
 * constraint as a friendly error.
 */
export const updateOwnProfile = createServerFn({ method: "POST" })
  .validator((data: UpdateOwnProfileInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    const session = await readSession();

    if (!session) {
      throw new Error("Unauthorized");
    }

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const email = data.email.trim();
    const name = `${firstName} ${lastName}`.trim();

    if (!firstName) {
      throw new Error("First name is required.");
    }

    if (!isValidEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    try {
      await getAppDb()
        .update(user)
        .set({ email, firstName, lastName, name, updatedAt: new Date() })
        .where(eq(user.id, session.user.id));
    } catch {
      throw new Error("That email address is already in use.");
    }

    return { success: true };
  });

export const requireSessionMiddleware = createMiddleware({
  type: "function",
}).server(async ({ next }) => {
  const session = await readSession();

  if (!session) {
    throw new Error("Unauthorized");
  }

  return next({ context: { session } });
});
