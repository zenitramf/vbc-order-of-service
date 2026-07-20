# MCP access

The application exposes a stateless MCP Streamable HTTP endpoint at
`/api/mcp`. An authenticated user can create an API key from their profile
page; the secret is displayed only once. Configure an MCP client with the key
as a bearer token, for example:

```sh
claude mcp add --transport http vbc-order-of-service https://example.com/api/mcp \
  --header "Authorization: Bearer vbc_your_api_key"
```

Available tools are filtered by the API-key owner's role permissions. Revoke a
key from the profile page, or from the user's administration page as an admin.

# Victory Baptist Church Order of Service

A TanStack Start app deployed on Cloudflare Workers for planning church orders of service.

## Features

- Dark-mode dashboard with left-side navigation and breadcrumbs.
- Orders of service with service type, service date, Planning/Published status, service cards, activities, drag reordering, hymn selection, and a placeholder **Publish and Send** action.
- Template CRUD for reusable service plans. Saving a template also creates/updates the selectable service type.
- Hymn library CRUD with hymn number, name, Markdown lyrics, music key, last played, times played in the last six months, and source tags.
- Cloudflare D1 schema and migrations, including a hymn seed generated from `db/song-library-seed.csv`.

## Getting Started

From your terminal:

```sh
pnpm install
pnpm run db:migrate:local
pnpm dev
```

The app runs on port `3000`.

## Database

This project uses **Drizzle ORM** over Cloudflare D1 (the `DB` binding in
`wrangler.jsonc`). The data layer builds queries with the Drizzle query builder
and typed `sql` fragments — there is no direct `env.DB.prepare()` in application
modules, and no runtime schema bootstrap.

- **Schema (code-first source of truth):** `src/db/schema/*` (one module per
  domain, re-exported from `src/db/schema/index.ts`).
- **Client factory:** `src/db/client.ts` — `createDb(binding)` and `getAppDb()`.
- **Migrations:** plain SQL in `migrations/`, applied only by **Wrangler** (the
  single migration executor, local + remote, tracked in `d1_migrations`).

### One migration workflow

Drizzle Kit **authors** migration SQL from the schema; Wrangler **applies** it.
Do not let both tools apply migrations to the same database.

```sh
# 1. Edit src/db/schema/*, then author SQL from the schema diff:
pnpm run db:generate        # drizzle-kit generate (writes to ./drizzle)
#    Review it and copy the SQL into the next migrations/000N_*.sql file.
# 2. Apply with Wrangler:
pnpm run db:migrate:local   # local D1
pnpm run db:migrate:remote  # remote D1
```

`pnpm run db:check` validates the schema. Use **pnpm** for all dependency
changes (there is a single `pnpm-lock.yaml`).

### Auth

Better Auth runs on the Drizzle + D1 adapter (`src/lib/auth.ts`), mounted at
`/api/auth/*` in `src/worker.ts`. Auth tables live in
`migrations/0009_add_auth_tables.sql` / `src/db/schema/auth.ts`. Set the
`BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` secrets:

```sh
wrangler secret put BETTER_AUTH_SECRET   # openssl rand -base64 32
wrangler secret put BETTER_AUTH_URL
```

If a new environment's tables are empty, apply all migrations with
`pnpm run db:migrate:local` (or `:remote`); the seed data lives in the
migrations, not in runtime code.

## Build

```sh
pnpm build
```

## Preview

```sh
pnpm preview
```

## Deploy to Cloudflare

```sh
pnpm run db:migrate:remote
pnpm run deploy
```

## Cloudflare Bindings

Server functions access bindings with importable `env`:

```ts
import { env } from "cloudflare:workers";
```
