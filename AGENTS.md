# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command               | Purpose                   |
| --------------------- | ------------------------- |
| `npx wrangler dev`    | Local development         |
| `npx wrangler deploy` | Deploy to Cloudflare      |
| `npx wrangler types`  | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Multi-Worker deploy (announcement image gen)

AI background generation runs on a **separate slim Worker** so payloads never
share the TanStack Start isolate (128 MB limit).

| Worker | Role |
| ------ | ---- |
| `vbc-order-of-service` | App HTTP + email queue; **produces** announcement AI jobs (no `env.AI`) |
| `vbc-oos-announcement-image-gen` | **Consumes** queue → background images + layout plans → R2 |

```bash
pnpm deploy:image-gen   # deploy consumer first (claims the queue)
pnpm deploy             # main app (producer only for image-gen)
# or
pnpm deploy:all
```

Local end-to-end image gen needs the consumer running separately:

```bash
pnpm exec wrangler dev -c workers/announcement-image-gen/wrangler.jsonc
```

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

## Best Practices (conditional)

If the application uses Durable Objects or Workflows, refer to the relevant best practices:

- Durable Objects: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- Workflows: https://developers.cloudflare.com/workflows/build/rules-of-workflows/

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `npm exec -- ultracite fix`
- **Check for issues**: `npm exec -- ultracite check`
- **Diagnose setup**: `npm exec -- ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `npm exec -- ultracite fix` before committing to ensure compliance.

---

## Cursor Cloud specific instructions

TanStack Start app on Cloudflare Workers (Vite dev server + local D1/R2/Queues via
miniflare). Package manager is **pnpm** (single `pnpm-lock.yaml`). Standard scripts live
in `package.json`; setup/run basics are in `README.md`. The startup update script runs
`pnpm install` (its `postinstall` runs `wrangler types`).

Non-obvious gotchas:

- **Node version for lint/format.** The default on-PATH `node` (`/exec-daemon/node`) is
  v22.14, which is too old for `ultracite` (oxlint/oxfmt) — their `.ts` config files
  require Node `^20.19.0 || >=22.18.0`, so `pnpm check` / `pnpm fix` fail with
  "Unknown file extension .ts". Use the pre-baked nvm Node before running them:
  `nvm use 22.22.2` (then `pnpm check` / `pnpm fix`). Install/test/build/dev all work on
  the default node too. `pnpm check` reports pre-existing lint/format findings in the repo
  — those are not environment problems.
- **Local D1 is not persisted and there is no runtime schema bootstrap.** After
  `pnpm install`, run `pnpm run db:migrate:local` once to create and seed the local D1
  (auth tables, roles, and 315 hymns) before `pnpm dev`; otherwise pages that read the DB
  fail. Migrations are authored by Drizzle Kit but applied only by Wrangler (see README).
  The dev server and the migrate command share the same local D1 at
  `.wrangler/state/v3/d1/`. The orders table is named `orders_of_service`.
- **Dev auth needs `.dev.vars`.** Better Auth reads `BETTER_AUTH_SECRET` (>= 32 chars) and
  `BETTER_AUTH_URL` from a gitignored `.dev.vars`. For local dev create it with, e.g.:
  `BETTER_AUTH_SECRET="<32+ char secret>"` and `BETTER_AUTH_URL="http://localhost:3000"`.
  Optional features (email via Proton SMTP, PDF generation, AI announcement backgrounds)
  need more secrets — see the fuller list in `worker-configuration.d.ts` — but they are not
  required to run or exercise the core order-of-service flow.
- **No public sign-up UI.** `/login` only signs in. Bootstrap the first user via the Better
  Auth API (email/password is enabled), then log in at `/login`. `firstName`/`lastName` are
  required and requests need an `Origin` header, e.g.:
  `curl -X POST http://localhost:3000/api/auth/sign-up/email -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' -d '{"email":"you@example.com","password":"Password123!","name":"You","firstName":"You","lastName":"Name"}'`
- **Dev server** runs on port `3000` (`pnpm dev`). The announcement image-gen consumer is a
  separate Worker and is only needed for AI background generation (see the multi-Worker
  section above).
