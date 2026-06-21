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

This project uses Cloudflare D1 via the `DB` binding in `wrangler.jsonc`.

Local setup:

```sh
pnpm run db:migrate:local
```

Remote setup/deploy setup:

```sh
pnpm run db:migrate:remote
```

Migrations:

- `migrations/0001_order_of_service_schema.sql` creates reference tables, templates, orders, hymns, and hymn play history.
- `migrations/0002_seed_hymns.sql` seeds the hymn table from `db/song-library-seed.csv`.

If the hymn page is empty in a new environment, apply the migrations above.

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
