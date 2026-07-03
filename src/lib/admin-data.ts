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
  token: string;
  userAgent: string | null;
}

export interface ListUsersInput {
  page?: number;
  search?: string;
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
        token: session.token,
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
      token: row.token,
      userAgent: row.userAgent,
    }));
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
