# MCP Server Implementation Plan

Victory Baptist Church Order of Service — remote MCP server over the existing Cloudflare Workers + D1 domain.

**Status:** planning (not implemented)  
**Stack fit:** Cloudflare Agents SDK (`createMcpHandler` / optional `McpAgent`) + existing `src/lib/*` domain layer  
**Primary clients:** Cursor, Claude Desktop, MCP Inspector, Cloudflare AI Playground

---

## 1. Goal

Expose the app’s planning domain to AI agents so they can:

- Inspect dashboard, orders, templates, hymns, teams, members, and month plans
- Draft and update service orders and templates
- Suggest hymns with recent-play awareness
- Staff teams for a month
- Check publish readiness and (with confirmation) publish / email

without reimplementing business rules that already live in `src/lib/order-service-data.ts`, `teams-logic.ts`, and related modules.

### Non-goals (v1)

- Replacing the web UI
- Impersonation, password reset, or bulk user deletion via MCP
- Public unauthenticated write access
- A separate product database or duplicated schema

---

## 2. Recommended architecture

### 2.1 Hosting: co-located Worker route

Mount MCP on the **same** Worker as the TanStack Start app:

| Option | Verdict |
| --- | --- |
| **Same Worker, `/mcp` route** (recommended) | Shares D1/R2/Queue/DO bindings; one deploy; reuses domain libs |
| Separate Worker + service binding | Cleaner isolation, but dual deploys and duplicated env secrets |
| Local stdio-only server | Fine for personal scripting; not the target for shared church ops |

**Worker change (conceptual):** in `src/worker.ts`, route `/mcp` (and later OAuth `/authorize`, `/token`, `/register`, `/callback`) to an MCP handler; everything else continues to TanStack Start.

```ts
// Conceptual — not implemented yet
async fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (url.pathname === "/mcp" || url.pathname.startsWith("/mcp/")) {
    return mcpFetch(request, env, ctx);
  }
  return serverEntry.fetch(request);
}
```

### 2.2 Server style: stateless first

| Approach | When |
| --- | --- |
| **`createMcpHandler` + per-request `McpServer`** (recommended for v1) | Tools are request-scoped; auth context from OAuth props; no session Durable Object needed |
| `McpAgent` / stateful Agent | Later, if we need elicitation (“Confirm publish?”), multi-step drafts, or sampling |

Follow current Agents SDK guidance: **create a new `McpServer` per request** (MCP SDK ≥ 1.26.0) to avoid cross-client response leakage.

Docs: [Remote MCP server](https://developers.cloudflare.com/agents/guides/remote-mcp-server/), [createMcpHandler](https://developers.cloudflare.com/agents/api-reference/mcp-handler-api/).

### 2.3 Domain layer adapter

Do **not** call TanStack server functions from MCP. Extract a thin **MCP adapter** that:

1. Resolves the authenticated principal + role permissions
2. Enforces `hasPermission(permissions, resource, action)` (same catalog as `admin-permissions.ts`)
3. Calls the same pure/data helpers used today (prefer moving permission checks into shared “service” wrappers so UI and MCP stay aligned)

**Critical gap today:** most of `order-service-data.ts` trusts route guards. MCP must not inherit that assumption — every tool/resource must authorize.

Suggested layout:

```text
src/mcp/
  server.ts              # createMcpServer(env, auth) — register tools/resources/prompts
  auth.ts                # map OAuth props → app user + permissions
  permissions.ts         # requirePermission helpers
  resources/             # URI handlers
  tools/                 # tool handlers by domain
  prompts/               # prompt templates
  schemas.ts             # Zod schemas shared with tools (reuse order-service-types shapes)
```

Keep `order-service-data.ts` as the single source of DB/R2/queue logic; MCP tools wrap it.

---

## 3. Authentication & authorization

### 3.1 Transport auth (recommended path)

Use **Workers OAuth Provider** (`@cloudflare/workers-oauth-provider`) in front of `/mcp`, then map the authenticated identity onto an existing Better Auth `user` + `roles.permissions`.

**Preferred identity bridge for this app:**

1. MCP client completes OAuth (Cloudflare Access, or email-gated provider matching church users)
2. OAuth props include a stable email (or subject)
3. Adapter looks up `user` by email in D1
4. Load role permissions via existing role tables
5. Reject if banned / unknown / email not verified (policy TBD)

**Alternative (simpler, less ideal):** long-lived API tokens stored hashed in D1, issued from the admin UI, scoped by role. Good for Cursor personal use; weaker for multi-user audit.

**Do not** pass Better Auth session cookies from arbitrary MCP clients — browsers and AI clients do not share that cookie jar reliably.

### 3.2 Permission mapping

Reuse `PERMISSION_RESOURCES` / `hasPermission`:

| MCP surface | Required permission |
| --- | --- |
| Read orders / planner | `orders:view` |
| Create / update / delete orders | `orders:create` / `update` / `delete` |
| Publish / PDF / email send | `orders:update` (+ explicit “destructive” confirmations) |
| Templates | `templates:*` |
| Hymns / files | `hymns:*` |
| Teams / members | `teams:*` / `members:*` |
| Email / month planning settings | `settings:view` / `settings:update` |
| Admin users/roles | `user.role === "admin"` **and** matching `users:*` / `roles:*` |

Wildcard admin (`{ "*": ["*"] }`) continues to grant all.

### 3.3 Destructive / side-effect tools

Require an explicit `confirm: true` boolean (or later MCP elicitation) for:

- `publish_order`
- `send_order_email`
- `delete_*`
- `save_email_settings` (secrets)
- Admin revoke / ban / delete role

Never expose impersonation via MCP.

---

## 4. MCP surface design

### 4.1 Resources (read-only snapshots)

URI scheme: `vbc://…`

| URI | Source | Notes |
| --- | --- | --- |
| `vbc://dashboard` | `getDashboardData` | |
| `vbc://reference` | `getReferenceData` | service/activity/hymn catalogs |
| `vbc://orders` | `getOrders` | summaries |
| `vbc://orders/{id}` | `getOrder` | full `order_json` |
| `vbc://orders/{id}/email-delivery` | `getOrderEmailDelivery` | |
| `vbc://templates` | `getTemplates` | |
| `vbc://templates/{id}` | `getTemplate` | |
| `vbc://planner/{yyyy-mm}` | **read-only plan view** | Do **not** call `getMonthPlan` as-is for resources — it auto-creates current-month orders. Add `peekMonthPlan` / `autoCreate: false` flag. |
| `vbc://planner/settings` | `getMonthPlanningSettings` | |
| `vbc://hymns` | `getHymns` | |
| `vbc://hymns/{id}` | `getHymn` | |
| `vbc://hymns/{id}/files` | `getHymnFiles` | metadata only |
| `vbc://teams` | `getTeams` | |
| `vbc://teams/{id}` | `getTeam` | |
| `vbc://members` | `getTeamMembers` | |
| `vbc://members/{id}` | `getTeamMember` | |
| `vbc://settings/email` | `getEmailSettings` | secrets redacted |
| `vbc://me` | session + permissions | |

Binary PDFs / hymn files: **metadata in resources; bytes via download tools** (base64 or temporary signed R2 URL if added later).

### 4.2 Tools (mutations & workflows)

#### Phase A — read + readiness (ship first)

| Tool | Permission | Wraps |
| --- | --- | --- |
| `get_dashboard` | any authed | `getDashboardData` |
| `list_orders` / `get_order` | `orders:view` | list/get |
| `list_templates` / `get_template` | `templates:view` | |
| `list_hymns` / `get_hymn` / `list_hymn_options` | `hymns:view` | |
| `list_teams` / `get_team` / `list_members` | teams/members view | |
| `get_month_plan` | `orders:view` | peek without auto-create by default; `createMissing?: boolean` |
| `check_publish_readiness` | `orders:view` | compose `findMissingRequiredTeams` + hymn activity validation (extract from `publishOrder`) |

#### Phase B — planning mutations

| Tool | Permission | Wraps |
| --- | --- | --- |
| `create_order_from_template` | `orders:create` | `createOrder` |
| `update_order` | `orders:update` | `saveOrder` |
| `delete_order` | `orders:delete` | `deleteOrder` + `confirm` |
| `save_template` / `delete_template` | templates | |
| `plan_month` | `orders:create` | `planMonth` |
| `save_month_planning_settings` | `settings:update` | |
| `save_month_schedule` | `orders:update` | `saveMonthSchedule` |
| `save_hymn` / `delete_hymn` | hymns | |
| `save_team` / `delete_team` / membership tools | teams | |
| `save_member` / `delete_member` | members | |

#### Phase C — publish / email / files

| Tool | Permission | Wraps |
| --- | --- | --- |
| `preview_order_pdf_payload` | `orders:view` | `postOrderToCraftMyPdf({ dryRun: true })` |
| `publish_order` | `orders:update` + `confirm` | `publishOrder` |
| `download_published_order_pdf` | `orders:view` | `getPublishedOrderPdf` |
| `send_order_email` | `orders:update` + `confirm` | `sendOrderEmail` |
| Hymn file upload/rename/delete/download | `hymns:*` | existing file helpers |
| Email settings / recipients | `settings:update` | redacted reads; confirm on secret writes |

#### Phase D — admin (optional, gated)

Only if product owners want agents to manage access: list users, update profile fields, revoke sessions, CRUD custom roles. **Exclude** impersonate / set password / remove user from default tool set.

### 4.3 Prompts (agent playbooks)

| Prompt | Purpose |
| --- | --- |
| `publish_readiness_check` | Load order + teams + hymns; report blockers |
| `month_staffing_review` | Unstaffed required teams, missing orders, overloaded members |
| `hymn_rotation_suggestions` | Prefer low `timesPlayedLastSixMonths`, match key/source |
| `draft_order_from_theme` | Build `OrderServiceTemplateJson`-shaped draft from theme + catalog |
| `template_builder` | Segments, activities, required/optional teams + counts |
| `email_order_announcement` | Human summary before `send_order_email` |

Prompts should instruct the model to **read resources / call readiness tools before mutating**.

---

## 5. Domain rules agents must respect

Encode these in tool descriptions and server-side validation (already enforced in data layer where noted):

- One order per `serviceDate` (unique index)
- New orders start as `Planning`; publish requires hymns selected on hymn activities and required teams staffed to counts (1–10)
- Template save upserts a matching `service_types` row (slug from name)
- Template delete blocked when referenced by orders or month planning settings
- Team delete blocked when referenced in template/order JSON
- Team hierarchy: max one parent level; no cycles / no “sub of sub”
- `getMonthPlan` today auto-creates current month — MCP must default to non-mutating peek
- Publishing writes R2 PDF, records `hymn_plays`, updates `lastPlayed`
- Email requires Published + PDF + SMTP configured + recipients; one delivery row per order
- SMTP credentials encrypted with `EMAIL_SETTINGS_ENCRYPTION_KEY` — never return plaintext via MCP

---

## 6. Implementation phases

### Phase 0 — prerequisites

1. Add deps: `agents`, `@modelcontextprotocol/sdk` (pin to versions compatible with Workers + MCP SDK ≥ 1.26)
2. Split side-effecting “reads”: `getMonthPlan({ autoCreate?: boolean })` (default `true` for UI compatibility; MCP passes `false`)
3. Extract `assertPublishable(order, teams, members)` from `publishOrder` for readiness tools
4. Add shared `requirePermission` for server-side use by both UI server functions and MCP (incremental; MCP first)

### Phase 1 — scaffold + authless local

1. `src/mcp/server.ts` with hello + `get_dashboard` (guarded later)
2. Wire `/mcp` in `worker.ts` via `createMcpHandler`
3. Local verify with MCP Inspector against `wrangler`/Vite worker URL
4. Unit-test tool schema validation with Vitest

### Phase 2 — auth + Phase A tools/resources

1. OAuth provider or API-token path
2. Permission-gated resources + Phase A tools
3. Prompts: `publish_readiness_check`, `hymn_rotation_suggestions`

### Phase 3 — Phase B planning mutations

1. Order/template/planner/hymn/team/member tools
2. Integration tests against local D1 fixtures

### Phase 4 — Phase C publish/email

1. Confirm flags + dry-run PDF preview
2. Observability: log actor, tool name, order id (Workers observability already enabled)

### Phase 5 — harden

1. Rate limits / max payload size for base64 uploads
2. Audit table optional: `mcp_audit_log` (actor, tool, args hash, result status)
3. Consider `McpAgent` only if elicitation is required for confirmations

---

## 7. Testing strategy

| Layer | What |
| --- | --- |
| Unit | Zod schemas; permission denials; readiness helpers; month peek without create |
| Integration | Local D1 + tool handlers for create order → update hymns/teams → readiness |
| Manual | MCP Inspector OAuth flow; Cursor remote MCP config |
| Regression | Existing Vitest (`teams-logic`, email verification) stays green |

Do not use Playwright as the primary MCP test path.

---

## 8. Client configuration (target)

Example Cursor / Claude Desktop remote entry (after deploy):

```json
{
  "mcpServers": {
    "vbc-order-of-service": {
      "url": "https://<worker-host>/mcp"
    }
  }
}
```

Local development may use `mcp-remote` proxy if the client lacks native Streamable HTTP + OAuth.

---

## 9. Open decisions (defaults proposed)

| Decision | Recommendation | Rationale |
| --- | --- | --- |
| Same Worker vs separate | **Same Worker `/mcp`** | Shared bindings + domain code |
| Stateless vs McpAgent | **Stateless `createMcpHandler` v1** | Domain is request-scoped |
| Auth | **OAuth → email → Better Auth user** | Matches existing users/roles |
| Month plan resource | **Non-mutating peek by default** | Avoid surprise order creation |
| Admin tools | **Omit from v1** | High blast radius |
| Confirm pattern | **`confirm: true` arg** until elicitation | Simple, works with all clients |
| Binary delivery | **Base64 tools v1** | Matches existing helpers; add signed URLs later |

---

## 10. Success criteria

1. Authenticated agent can list upcoming orders and open a full order JSON via resources/tools
2. Agent can draft hymn selections avoiding recently played hymns using catalog + prompts
3. Agent can report publish blockers without calling CraftMyPDF
4. With confirmation, agent can publish and queue email using existing pipelines
5. Unauthorized callers cannot mutate; permission denials are explicit MCP errors
6. UI behavior for month planner auto-create remains unchanged

---

## 11. Suggested first PR after this plan

1. `getMonthPlan` / peek flag + `assertPublishable` extraction  
2. `src/mcp` scaffold + `/mcp` route + Phase A tools behind a feature flag / auth stub  
3. Auth bridge PR  
4. Mutation tools PR  

This document is the design baseline; implementation should update it when open decisions are resolved differently.
