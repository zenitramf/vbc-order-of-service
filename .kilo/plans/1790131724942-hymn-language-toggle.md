# Hymn Language (English/Spanish) + Toggle Plan

## Goal
Add `language` (`english` | `spanish`, default `english`) to hymn data, with a shadcn `ToggleGroup` selector in the hymn editor and a language filter + badge column on the hymn library list.

## Confirmed decisions
- Storage: `TEXT NOT NULL DEFAULT 'english'` with `CHECK (language IN ('english','spanish'))`; existing rows backfill to `english`.
- Editor + list filter scope (both).
- List shows a Language `Badge` column; order-editor hymn picker (`getHymnOptions`) unchanged.
- New hymns default `english`; editor value is required (never empty).

## Non-goals
- No `hymn_languages` reference table.
- No order-picker language display/grouping, no lyrics translation, no UI localization, no CSV re-import.

## Migration / schema
1. `src/db/schema/hymns.ts`: add `language: text("language").notNull().default("english")` (+ optional `index("hymns_language_idx")`). Mirror migrations comment.
2. Author SQL via `pnpm run db:generate` (`drizzle-kit generate`), review, copy into `migrations/0020_add_hymn_language.sql` (next number after `0019`). Expected shape:
   ```sql
   ALTER TABLE hymns ADD COLUMN language TEXT NOT NULL DEFAULT 'english'
     CHECK (language IN ('english','spanish'));
   UPDATE hymns SET language = 'english' WHERE language IS NULL OR language = '';
   ```
   - If SQLite/D1 rejects `CHECK` on `ADD COLUMN`, keep `NOT NULL DEFAULT 'english'` and enforce at app + zod layers; note in PR.
3. `pnpm run db:check`, then `pnpm run db:migrate:local` (remote via `db:migrate:remote` at deploy).
4. No change to `migrations/0002_seed_hymns.sql` or `db/song-library-seed.csv`; inserts without `language` get `english`.

## Ordered tasks
1. **Types** (`src/lib/order-service-types.ts`):
   - Add `export type HymnLanguage = "english" | "spanish";`
   - `HymnRecord`: add `language: HymnLanguage`.
   - `SaveHymnInput`: add `language: HymnLanguage`.
   - `CraftMyPdfOrderPayloadHymn`: add `language: HymnLanguage` (flows via existing `{...hymn}` spread in `buildCraftMyPdfPayload`; additive only).
   - Leave `HymnOption` unchanged (picker out of scope).
2. **Server data** (`src/lib/order-service-data.ts`):
   - `mapHymnRow`: map `language` with legacy fallback: normalize `asString(row.language)` lowercase, accept only `english`/`spanish`, else `english`.
   - `saveHymn`: normalize/validate `language` (trim+lowercase; throw `"Language must be english or spanish."` on other values, default `english` when missing for back-compat); include in `values` and in `onConflictDoUpdate.set`.
   - `getHymns`/`getHymn`/`loadHymnsById`: no query change (`SELECT hymns.*` picks up column); mapping covers it.
3. **Filters** (`src/lib/hymn-filters.ts`):
   - Add `language?: HymnLanguage` to `HymnListFilters`; add `matchesExactField(hymn.language, filters.language)` to `filterHymns`.
   - Update `src/lib/hymn-filters.test.ts`: factory default `language: "english"`; add case filtering `english` vs `spanish`.
4. **Editor UI** (`src/components/hymn-editor-page.tsx`):
   - State: `const [language, setLanguage] = React.useState<HymnLanguage>(hymn?.language ?? "english")`.
   - Submit: include `language` in `saveHymnFn({ data: {...} })`.
   - UI in Hymn details `FieldGroup`, after Source tag field: `Field` + `FieldLabel "Language"` + `ToggleGroup` (radix API — repo uses `radix-ui` primitive):
     ```tsx
     import { ToggleGroup, ToggleGroupItem } from "~/components/ui/toggle-group";
     <ToggleGroup type="single" value={language} onValueChange={(v) => { if (v === "english" || v === "spanish") setLanguage(v); }} spacing={2} aria-label="Hymn language">
       <ToggleGroupItem value="english">English</ToggleGroupItem>
       <ToggleGroupItem value="spanish">Español</ToggleGroupItem>
     </ToggleGroup>
     ```
     - Guard empty-string deselect (radix single can emit `""`) to keep required value.
     - Follow `.agents/skills/shadcn/rules/forms.md` (Field + ToggleGroup) and `base-vs-radix.md` (radix `type="single"`, plain string value).
5. **List UI** (`src/routes/_authenticated/hymns/index.tsx`):
   - State: `const [languageFilter, setLanguageFilter] = useState<string>(ALL_FILTER_VALUE)` (`"all" | "english" | "spanish"`).
   - Column: `{ accessorKey: "language", header: "Language", cell: ({row}) => <Badge variant="secondary">{row.original.language === "spanish" ? "Español" : "English"}</Badge> }`.
   - Filter control in filter grid: `ToggleGroup type="single" value={languageFilter} onValueChange={(v) => v && setLanguageFilter(v)}` with items All / English / Español, default All.
   - Wire: `filterHymns(hymnRows, { ..., language: languageFilter === ALL_FILTER_VALUE ? undefined : (languageFilter as HymnLanguage) })`; update `hasActiveFilters` + `handleClearFilters` (reset to `"all"`); add `languageFilter` to `useMemo` deps.
6. **MCP** (`src/lib/mcp-server.ts`):
   - `saveHymnInput`: add `language: z.enum(["english","spanish"]).default("english")` (optional-with-default keeps old clients working).
   - `hymnListFiltersInput`: add `language: z.enum(["english","spanish"]).optional()`.
   - `update_hymn` handler: pass through `language: current.language` in `saveHymn` call (currently omits it — would otherwise reset Spanish to default).
7. **Docs**: update `README.md` hymn-library bullet to mention language if touching it (optional, one line).

## Failure modes / edge cases
- Radix single-toggle deselect emits `""` → must be ignored in both editor and list filter (list uses `"all"` sentinel, so `v &&` guard).
- Bilingual hymns (e.g. existing "Worthy of Worship (English and Spanish)") have no multi-value support; editor forces one choice — accepted limitation.
- Old MCP/`saveHymn` callers omitting `language` → server defaults `english`; `update_hymn` must preserve current value (task 6).
- `SELECT hymns.*` queries need no change; any raw select listing hymn columns explicitly must be checked for `language` (currently all use `*`).
- SQLite `CHECK` on `ADD COLUMN`: verify on local D1; fallback to app-level validation only.

## Validation
- `pnpm run db:check`
- `pnpm test` (vitest; covers updated `hymn-filters.test.ts`)
- `pnpm build` (`vite build && tsc --noEmit`)
- `pnpm check` / `pnpm fix` (ultracite) before commit
- Manual: new hymn shows English pressed by default; save persists; edit Spanish persists; list shows Badge + All/English/Español filter works; order hymn picker unchanged; `list_hymns` MCP filter by language works.

## Open questions
- None. All material decisions resolved with user (storage text enum, editor+list scope, badge column with picker unchanged).
