import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { asc, desc, eq, like, sql } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import { getAppDb } from "~/db/client";
import { roles as rolesTable, session, user } from "~/db/schema";
import type { RoleRecord, SaveRoleInput } from "~/lib/admin-permissions";
import { parsePermissions } from "~/lib/admin-permissions";
import { createAuth } from "~/lib/auth";
import { EMAIL_SETTINGS_KEY, getStoredEmailSettings } from "~/lib/email-sender";
import { resolveEmailVerifiedAfterEmailUpdate } from "~/lib/email-verification";
import { isValidEmail } from "~/lib/teams-logic";
import { PASSWORD_RESET_PATH } from "~/lib/user-onboarding";

export const USERS_PAGE_SIZE = 10;

export interface AdminUserSummary {
  banned: boolean;
  createdAt: string;
  email: string;
  emailVerified: boolean;
  firstName: string;
  id: string;
  lastName: string;
  name: string;
  role: string | null;
}

export interface ListUsersResult {
  page: number;
  pageCount: number;
  search: string;
  total: number;
  users: AdminUserSummary[];
}

export interface AdminSessionSummary {
  createdAt: string;
  expiresAt: string;
  id: string;
  impersonatedBy: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface ListUsersInput {
  page?: number;
  search?: string;
}

export interface UpdateUserProfileAdminInput {
  email: string;
  firstName: string;
  lastName: string;
  userId: string;
}

const toIso = (value: Date | null): string =>
  value instanceof Date ? value.toISOString() : "";

/**
 * Guard every admin server function. Reads the caller's Better Auth session and
 * rejects anyone whose role is not `admin` (the User Admin page is admin-only).
 */
const requireAdmin = async () => {
  const headers = getRequestHeaders();
  const currentSession = await createAuth(env).api.getSession({ headers });

  if (!currentSession || currentSession.user.role !== "admin") {
    throw new Error("You do not have permission to manage users.");
  }

  return currentSession;
};

export const listUsersAdmin = createServerFn({ method: "GET" })
  .validator((data: ListUsersInput) => data)
  .handler(async ({ data }): Promise<ListUsersResult> => {
    await requireAdmin();
    const db = getAppDb();
    const search = (data.search ?? "").trim();
    const page = Math.max(1, Math.floor(data.page ?? 1));
    const offset = (page - 1) * USERS_PAGE_SIZE;

    // Search the computed display name for first-name, last-name, or full-name
    // matches while preserving email-specific search for addresses.
    const where = search
      ? like(search.includes("@") ? user.email : user.name, `%${search}%`)
      : undefined;

    const [rows, totalRow] = await Promise.all([
      db
        .select({
          banned: user.banned,
          createdAt: user.createdAt,
          email: user.email,
          emailVerified: user.emailVerified,
          firstName: user.firstName,
          id: user.id,
          lastName: user.lastName,
          name: user.name,
          role: user.role,
        })
        .from(user)
        .where(where)
        .orderBy(asc(user.name))
        .limit(USERS_PAGE_SIZE)
        .offset(offset)
        .all(),
      db
        .select({ value: sql<number>`count(*)` })
        .from(user)
        .where(where)
        .get(),
    ]);

    const total = totalRow?.value ?? 0;

    return {
      page,
      pageCount: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
      search,
      total,
      users: rows.map((row) => ({
        banned: row.banned ?? false,
        createdAt: toIso(row.createdAt),
        email: row.email,
        emailVerified: row.emailVerified,
        firstName: row.firstName,
        id: row.id,
        lastName: row.lastName,
        name: row.name,
        role: row.role,
      })),
    };
  });

export const getUserAdmin = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<AdminUserSummary | null> => {
    await requireAdmin();
    const db = getAppDb();
    const row = await db
      .select({
        banned: user.banned,
        createdAt: user.createdAt,
        email: user.email,
        emailVerified: user.emailVerified,
        firstName: user.firstName,
        id: user.id,
        lastName: user.lastName,
        name: user.name,
        role: user.role,
      })
      .from(user)
      .where(eq(user.id, data))
      .get();

    if (!row) {
      return null;
    }

    return {
      banned: row.banned ?? false,
      createdAt: toIso(row.createdAt),
      email: row.email,
      emailVerified: row.emailVerified,
      firstName: row.firstName,
      id: row.id,
      lastName: row.lastName,
      name: row.name,
      role: row.role,
    };
  });

export const getUserSessionsAdmin = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<AdminSessionSummary[]> => {
    await requireAdmin();
    const db = getAppDb();
    const rows = await db
      .select({
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        id: session.id,
        impersonatedBy: session.impersonatedBy,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      })
      .from(session)
      .where(eq(session.userId, data))
      .orderBy(desc(session.createdAt))
      .all();

    return rows.map((row) => ({
      createdAt: toIso(row.createdAt),
      expiresAt: toIso(row.expiresAt),
      id: row.id,
      impersonatedBy: row.impersonatedBy,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
    }));
  });

export const updateUserProfileAdmin = createServerFn({ method: "POST" })
  .validator((data: UpdateUserProfileAdminInput) => data)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();

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

    const db = getAppDb();
    const existing = await db
      .select({ email: user.email, emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, data.userId))
      .get();

    if (!existing) {
      throw new Error("User not found.");
    }

    const emailVerified = resolveEmailVerifiedAfterEmailUpdate({
      currentEmail: existing.email,
      currentEmailVerified: existing.emailVerified,
      nextEmail: email,
    });

    try {
      await db
        .update(user)
        .set({
          email,
          emailVerified,
          firstName,
          lastName,
          name,
          updatedAt: new Date(),
        })
        .where(eq(user.id, data.userId));
    } catch {
      throw new Error("That email address is already in use.");
    }

    return { success: true };
  });

export interface CreateUserWithOnboardingInput {
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface CreateUserWithOnboardingResult {
  onboardingEmailError?: string;
  onboardingEmailQueued: boolean;
  userId: string;
}

const getOnboardingEmailError = (error: unknown): string =>
  error instanceof Error && error.message
    ? error.message
    : "Unable to send the sign-in email.";

/**
 * Verify the email path is configured before asking Better Auth to queue the
 * link, so the admin gets immediate feedback instead of a silent queue
 * failure (Better Auth swallows hook errors).
 */
const assertOnboardingEmailReady = async (): Promise<void> => {
  if (!env.OOS_EMAIL_SENDER) {
    throw new Error("The email queue is not configured.");
  }

  await getStoredEmailSettings(env, EMAIL_SETTINGS_KEY);
};

/**
 * Create a user from the admin page with a random password, then email them a
 * login link so they set their own password and sign in for the first time.
 * The admin never chooses or sees the password.
 */
export const createUserWithOnboarding = createServerFn({ method: "POST" })
  .validator((data: CreateUserWithOnboardingInput) => data)
  .handler(async ({ data }): Promise<CreateUserWithOnboardingResult> => {
    await requireAdmin();

    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const email = data.email.trim();

    if (!firstName) {
      throw new Error("First name is required.");
    }

    if (!lastName) {
      throw new Error("Last name is required.");
    }

    if (!isValidEmail(email)) {
      throw new Error("Enter a valid email address.");
    }

    const db = getAppDb();
    const [existingUser, roleRecord] = await Promise.all([
      db.select({ id: user.id }).from(user).where(eq(user.email, email)).get(),
      db
        .select({ id: rolesTable.id })
        .from(rolesTable)
        .where(eq(rolesTable.id, data.role))
        .get(),
    ]);

    if (existingUser) {
      throw new Error("That email address is already in use.");
    }

    if (!roleRecord) {
      throw new Error("Role not found.");
    }

    const authInstance = createAuth(env);
    const headers = getRequestHeaders();
    const created = await authInstance.api.createUser({
      body: {
        data: { firstName, lastName },
        email,
        name: `${firstName} ${lastName}`,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        // Role ids come from the app's roles table; Better Auth's admin plugin
        // only types its built-in roles.
        role: data.role as "admin" | "user",
      },
      headers,
    });

    let onboardingEmailQueued = false;
    let onboardingEmailError: string | undefined;

    try {
      await assertOnboardingEmailReady();
      await authInstance.api.requestPasswordReset({
        body: { email, redirectTo: PASSWORD_RESET_PATH },
        headers,
      });
      onboardingEmailQueued = true;
    } catch (error) {
      onboardingEmailError = getOnboardingEmailError(error);
      console.error("Unable to send the new-user onboarding email.", error);
    }

    return {
      onboardingEmailError,
      onboardingEmailQueued,
      userId: created.user.id,
    };
  });

const mapRoleRow = (row: Record<string, unknown>): RoleRecord => ({
  createdAt: String(row.created_at ?? ""),
  description: String(row.description ?? ""),
  id: String(row.id ?? ""),
  isSystem: Number(row.is_system) === 1,
  name: String(row.name ?? ""),
  permissions: parsePermissions(String(row.permissions ?? "{}")),
  userCount: Number(row.user_count ?? 0),
});

const loadRoles = async (): Promise<RoleRecord[]> => {
  const rows = await getAppDb().all<Record<string, unknown>>(
    sql`SELECT roles.*, (SELECT COUNT(*) FROM user WHERE user.role = roles.id) AS user_count
      FROM roles
      ORDER BY roles.is_system DESC, roles.name ASC`
  );

  return rows.map(mapRoleRow);
};

export const getRoles = createServerFn({ method: "GET" }).handler(
  async (): Promise<RoleRecord[]> => {
    await requireAdmin();

    return await loadRoles();
  }
);

export const getRole = createServerFn({ method: "GET" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<RoleRecord | null> => {
    await requireAdmin();
    const rows = await getAppDb().all<Record<string, unknown>>(
      sql`SELECT roles.*, (SELECT COUNT(*) FROM user WHERE user.role = roles.id) AS user_count
        FROM roles
        WHERE roles.id = ${data}`
    );

    return rows.length > 0 ? mapRoleRow(rows[0]) : null;
  });

const slugify = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-+|-+$/gu, "") || uuidv4();

export const saveRole = createServerFn({ method: "POST" })
  .validator((data: SaveRoleInput) => data)
  .handler(async ({ data }): Promise<{ id: string }> => {
    await requireAdmin();
    const db = getAppDb();
    const name = data.name.trim();

    if (!name) {
      throw new Error("Role name is required.");
    }

    const permissions = JSON.stringify(data.permissions ?? {});
    const timestamp = new Date().toISOString();

    if (data.id) {
      const existing = await db
        .select({ isSystem: rolesTable.isSystem })
        .from(rolesTable)
        .where(eq(rolesTable.id, data.id))
        .get();

      if (!existing) {
        throw new Error("Role not found.");
      }

      if (existing.isSystem) {
        throw new Error("Built-in roles cannot be edited.");
      }

      await db
        .update(rolesTable)
        .set({
          description: data.description,
          name,
          permissions,
          updatedAt: timestamp,
        })
        .where(eq(rolesTable.id, data.id));

      return { id: data.id };
    }

    const id = slugify(name);

    const clash = await db
      .select({ id: rolesTable.id })
      .from(rolesTable)
      .where(eq(rolesTable.id, id))
      .get();

    if (clash) {
      throw new Error(`A role with the id "${id}" already exists.`);
    }

    await db.insert(rolesTable).values({
      description: data.description,
      id,
      isSystem: false,
      name,
      permissions,
      updatedAt: timestamp,
    });

    return { id };
  });

export const deleteRole = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data }): Promise<{ success: true }> => {
    await requireAdmin();
    const db = getAppDb();
    const [role, assigned] = await Promise.all([
      db
        .select({ isSystem: rolesTable.isSystem })
        .from(rolesTable)
        .where(eq(rolesTable.id, data))
        .get(),
      db
        .select({ value: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.role, data))
        .get(),
    ]);

    if (!role) {
      throw new Error("Role not found.");
    }

    if (role.isSystem) {
      throw new Error("Built-in roles cannot be removed.");
    }

    if ((assigned?.value ?? 0) > 0) {
      throw new Error(
        "Reassign the users who have this role before removing it."
      );
    }

    await db.delete(rolesTable).where(eq(rolesTable.id, data));

    return { success: true };
  });
