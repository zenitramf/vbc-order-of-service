import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";

import { account, session, user, verification } from "../db/schema/auth";

const noopD1 = {
  batch() {
    throw new Error("CLI schema generation should not batch database queries.");
  },
  dump() {
    throw new Error("CLI schema generation should not dump the database.");
  },
  exec() {
    throw new Error("CLI schema generation should not execute SQL.");
  },
  prepare() {
    throw new Error(
      "CLI schema generation should not execute database queries."
    );
  },
} as unknown as D1Database;

export const auth = betterAuth({
  baseURL: "http://localhost:3000",
  database: drizzleAdapter(drizzle(noopD1), {
    provider: "sqlite",
    schema: { account, session, user, verification },
  }),
  emailAndPassword: { enabled: true },
  plugins: [],
  secret: "0123456789abcdef0123456789abcdef",
});

export default auth;
