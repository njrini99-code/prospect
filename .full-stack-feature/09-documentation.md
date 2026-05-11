# 09 — Documentation & Handoff: ADP PEO Sales OS CRM

> Closing deliverable from the full-stack-feature orchestrator. Read this if you're Nick coming back to the project in 3 months, or a teammate joining the codebase for the first time. Everything else is linked from here.

**Owner:** Nick (njrini99@gmail.com) — solo ADP TotalSource (PEO/HRO) sales rep, 35-county eastern NC territory.
**Date completed:** 2026-05-11.
**Repo target:** `https://github.com/njrini99-code/prospect` (not yet pushed).

---

## 1. Executive summary

The ADP PEO Sales OS CRM is a local-first Next.js 16 app that replaces a fragmented workflow (16-tab Excel workbook + Google Sheets paste-in + SQLite enrichment DB + `_sales_os_state.json`) with one purpose-built operating system anchored to Nick's real schedule, cadence model, and refined ICP. The full data lake — **190,692 companies, 955,846 triggers, 15,798 carriers, 4,059 contacts, 1,514 incumbent-PEO records** — was migrated into Neon Postgres by `scripts/migrate_to_neon.py` (one-shot ETL across 5 local sources with dedupe on `(name_normalized, zip)` and full ICP/territory gating). The CRM ships with **9 pages** (`/login`, `/today`, `/accounts`, `/accounts/[id]`, `/pipeline`, `/bench`, `/dashboard`, `/settings`, plus the root redirect), **31 components**, **242 passing Vitest tests**, and a v1.1 schema upgrade that exposes the qualified bench universe of **13,715 ICP-fit prospects** (was 48 in the v1 build).

The CRM is in a **ship-go for local single-user** state. `npm run dev` boots in ~1.2s. `npm run build` is clean against Next 16.2.6 + React 19.2.6 + Drizzle 0.45.2. All 3 Critical and 8 High security/perf findings from Step 7's parallel review were remediated by an auto-mode fix agent. Three user actions remain before anything leaves localhost: **(1) rotate the Neon database password** (current cred appeared in audit transcripts), **(2) change `APP_PASSWORD` in `crm/.env.local`** from the placeholder `adppeo2026` to a 12+-char secret, and **(3) bind the dev server to `127.0.0.1`** (not the default `0.0.0.0`). After those, Nick's next action is to start using `/today` for Monday morning sends, log outcomes through the Cmd+L drawer, and on Sunday night re-run `python3 scripts/build_sales_os.py && python3 scripts/sync_to_neon.py` to refresh active cadences. Deploy-to-Vercel is documented and staged but deliberately not executed — that's a Nick decision when he wants public access.

---

## 2. What's in the box

### Orchestrator docs (`.full-stack-feature/`)

| File | What it covers | Lines |
|---|---|---:|
| [`01-requirements.md`](./01-requirements.md) | 17 acceptance criteria, scope (in/out), stack, ICP filters | ~140 |
| [`02-database-design.md`](./02-database-design.md) | 12-table schema spec + 3 views + ERD + index plan | ~470 |
| [`03-architecture.md`](./03-architecture.md) | Backend (Server Actions over REST) + frontend (App Router) + cross-cutting | ~350 |
| [`04-database-impl.md`](./04-database-impl.md) | Migration results: 190K companies, 955K triggers, 13.7K qualified ICP | ~120 |
| [`05-backend-impl.md`](./05-backend-impl.md) | Server Actions + queries + auth + `lib/` utilities | ~175 |
| [`06-frontend-impl.md`](./06-frontend-impl.md) | 9 pages, 31 components, design system, shortcuts | ~200 |
| [`07-testing.md`](./07-testing.md) | Step 7 consolidated review (3 critical + 8 high, all fixed) | ~120 |
| [`07a-test-report.md`](./07a-test-report.md) | Test agent detail — 172 → 223 → 242 passing | — |
| [`07b-security-audit.md`](./07b-security-audit.md) | Full security audit (4 critical, 11 high originally) | — |
| [`07c-performance-review.md`](./07c-performance-review.md) | Perf review — sparkline swap, pagination, KPI correctness | — |
| [`07d-fix-report.md`](./07d-fix-report.md) | Fix agent results — every C/H closed | ~160 |
| [`07e-v1.1-upgrade-report.md`](./07e-v1.1-upgrade-report.md) | Schema upgrade — bench 48 → 13,715 | ~135 |
| [`08-deployment.md`](./08-deployment.md) | CI pipeline + Vercel path + runbook summary | ~140 |
| **`09-documentation.md`** | **This file** — closing handoff | — |
| [`state.json`](./state.json) | Machine-readable orchestrator state | — |

### Code artifacts

| Path | Role |
|---|---|
| `crm/` | Next.js 16 application (full app — see breakdown below) |
| `crm/RUNBOOK.md` | 204-line operations runbook (daily, weekly, deploy, rollback, incidents) |
| `crm/.github/workflows/ci.yml` | CI: typecheck + 242-test gate + Next 16 build |
| `crm/vercel.json` | Vercel project config (region `iad1`, framework=nextjs) |
| `crm/vercel.ts.example` | TS-typed config + CSP-ready security headers block |
| `scripts/migrate_to_neon.py` (~1,598 LOC) | One-shot ETL from 5 local sources → Neon |
| `scripts/build_sales_os.py` (~3,613 LOC) | Sunday cadence rebuilder (existing, unchanged) |
| `scripts/sync_to_neon.py` (~344 LOC) | Idempotent UPSERT bridge after `build_sales_os.py` runs |
| `MIGRATION.md` (workspace root) | Schema + ETL rules reference (companion to `02-database-design.md`) |
| `README.md` (workspace root) | Top-level repo overview |

### Totals

| Metric | Value |
|---|---:|
| **CRM source files** (TS / TSX / CSS under `crm/src` + `crm/tests`) | **91** |
| **CRM lines of code** (same file set) | **11,313** |
| **Server Actions** | **11** (see § 3) |
| **Drizzle tables in `schema.ts`** | **14** (5 master + 9 legacy/CRM-only) |
| **Drizzle relations declared** | 12 |
| **Vitest tests** | **242 passing** (across 9 files) |
| **Playwright e2e specs** | 3 (login-and-log-outcome, pipeline-stage-move, bench-promote) |
| **Routes prerendered** | 12 |
| **Build status** | clean (`tsc --noEmit` + `npm test` + `npm run build`) |
| **Python orchestration** | 3 active scripts (migrate / build / sync), ~5,555 LOC |
| **Neon row counts** (post-migration, 2026-05-11) | 190,692 companies / 955,846 triggers / 15,798 carriers / 4,059 contacts / 1,514 incumbent_peo |
| **Qualified bench universe** | **13,715 prospects** accessible at `/bench` |

---

## 3. API reference — Server Actions

All Server Actions live in [`crm/src/app/actions/index.ts`](../crm/src/app/actions/index.ts) (569 LOC). The module is `"use server"`-marked at the top, so every export is invokable as a Server Action from RSC pages or client components.

Every mutating action follows this shape:
1. `await requireAuth()` — redirects to `/login` if cookie is invalid (defence-in-depth atop middleware).
2. Zod-parse the input.
3. Drizzle write (with implicit single-statement transactions; multi-step state transitions intentionally sequential).
4. `revalidatePath()` on every page that reads the mutated data.
5. Return `{ ok: true }` on success or `{ ok: false, error: string }` on validation/transition errors.

Many write paths accept either a numeric `companies.id` or a legacy `cadences.company_key` string. The internal helper `resolveCadence(idOrKey: string | number)` resolves both back to the same shape so the rest of the codebase doesn't have to branch.

### `loginAction(_prev: unknown, formData: FormData)`

| Aspect | Value |
|---|---|
| **Auth** | None (this IS the auth flow); rate-limited via `rateLimitLogin(ip)` — 5 attempts / 5 min / IP. |
| **Input** | `formData.password: string` (Zod: `min(1)`). |
| **Mutates** | Session cookie `sos_session` (httpOnly, sameSite=lax, secure-in-prod, 30-day maxAge). In-memory `Set<string>` of valid session ids. |
| **Returns** | On success: `redirect("/today")` (throws). On failure: `{ ok: false, error: "Incorrect password" \| "Password required" \| "Too many attempts..." }`. |
| **Revalidates** | `/today` (via redirect). |
| **Example** | Called by `crm/src/app/(auth)/login/page.tsx`'s `<form action={loginAction}>`. |

### `logoutAction()`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | None. |
| **Mutates** | Removes session id from in-memory Set; clears cookie. |
| **Returns** | `redirect("/login")` (throws). |
| **Revalidates** | `/login` (via redirect). |

### `logOutcome(input)`

The most-used action. Logs a touch outcome and routes follow-on state.

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | `z.object({ touchId?: number, companyKey: string, channel: string, outcome: string, notes?: string\|null, brokerCaptured?: string\|null })`. |
| **Mutates** | `touches` (mark completed + outcome + notes); inserts row in `outcomes_ledger` (append-only); auto-creates `brokers` row when `brokerCaptured` is set and not seen before. Plus state transitions: **KILL_OUTCOMES** (`not_interested`, `dnc`, `wrong_number`, `dead`, `acquired`, `disqualified`) → `cadences.status='DISQUALIFIED'`; **NURTURE_OUTCOMES** (`nurture_90d`, `meeting_cancelled`, `meeting_no_show`) → `cadences.status='NURTURE'` + `enrichment_notes='nurture_until=<+90d>'`; `meeting_booked` → upserts `meddpicc` row at `discovery_scheduled`; `meeting_held` → upserts at `discovery_held` (no downgrade if row already further along). |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/today`, `/accounts/${id\|key}`, `/pipeline`. |
| **Example** | Touch logger drawer (`Cmd+L` from any page) builds the input shape and invokes inside a `startTransition`. |

### `markTouchComplete(touchId: number, outcome: string)`

Lightweight variant when caller doesn't need the ledger write or transitions (used by Pulse rail's quick-complete on hovered rows).

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | Positional args (no Zod — internal). |
| **Mutates** | Only `touches.completed=true` + `touches.outcome`. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/today`. |

### `addNote(input)`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | `z.object({ companyKey: string, body: string.min(1) })`. |
| **Mutates** | Inserts into master `notes` (keyed by `company_id`), source=`'crm'`. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts/${idOrKey}`. |

### `addTask(input)`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | `z.object({ companyKey: string, body: string.min(1), dueDate?: string\|null })`. |
| **Mutates** | Inserts into master `tasks` with `status='open'`. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts/${idOrKey}`. |

### `toggleTask(id: number, done: boolean)`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | Positional. |
| **Mutates** | Flips `tasks.status` between `'done'` and `'open'`. Note: master schema uses `status` text, not a boolean `done` column — the API accepts a boolean for ergonomics. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts`. |

### `disqualifyAccount(idOrKey: string, reason: string)`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | Positional. |
| **Mutates** | Sets `cadences.status='DISQUALIFIED'` + `cadences.enrichment_notes=reason` (if a cadence exists); sets `companies.disqualified=true` + `companies.disqualified_reason=reason`. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts`, `/accounts/${companyId}`. |

### `promoteToActive(idOrKey: string\|number, routeDay?: number)`

Moves a bench account into an active cadence and seeds a 4-touch schedule.

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | Positional. `routeDay` optional — falls back to `routeDayForCounty(county)` from `lib/cadence.ts`. |
| **Mutates** | Updates or inserts the `cadences` row (`status='active'`, `route_day=resolved`); deletes any uncompleted `touches` for that cadence; bulk-inserts 16 new `touches` rows (`schedule.flatMap(d => 4 channels)` at offsets `[0, 3, 7, 14]`, channels `[call, email, linkedin, drop]`). |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts`, `/bench`, `/today`. |

### `updateMeddpicc(idOrKey: string, field: MeddpiccField, value: string)`

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | `field` must be one of `MeddpiccFields = ["stage", "mMetrics", "eEconBuyer", "d1DecisionCriteria", "d2DecisionProcess", "pPaperProcess", "iPain", "cChampion", "cmpCompetition", "nextAction"]` (throws if not). |
| **Mutates** | Upserts a row in `meddpicc` keyed by `company_id` (preferred) or legacy `company_key`. |
| **Returns** | `{ ok: true }`. |
| **Revalidates** | `/accounts/${slug}`, `/pipeline`. |

### `moveMeddpiccStage(idOrKey: string, stage: string)`

Validates a stage transition before delegating to `updateMeddpicc`. Used by kanban DnD/select on `/pipeline`.

| Aspect | Value |
|---|---|
| **Auth** | `requireAuth()`. |
| **Input** | Stage string is normalized (`STAGE_NORM`) so both human (`"Closed-Won"`) and machine (`"closed_won"`) labels work. |
| **Mutates** | Same as `updateMeddpicc` if transition is allowed. |
| **Transition matrix** | `discovery_scheduled → {discovery_held, nurture, closed_lost}` · `discovery_held → {proposal_sent, nurture, closed_lost}` · `proposal_sent → {closed_won, closed_lost, nurture}` · `closed_won → {}` (terminal) · `closed_lost → {nurture}` · `nurture → {discovery_scheduled, closed_lost}`. Seeding (no prior row) is allowed only into `discovery_scheduled` or `nurture`. |
| **Returns** | `{ ok: false, error: "invalid stage..." }` or `{ ok: true }`. |
| **Revalidates** | `/pipeline`, `/accounts/${slug}`. |

---

## 4. Schema reference

This is a brief read. Full table specs are in [`02-database-design.md`](./02-database-design.md); the migration-side rules (dedupe, disqualification, ICP gates) are in [`MIGRATION.md`](../MIGRATION.md). The actual Drizzle definitions are in `crm/src/db/schema.ts` (532 LOC, 14 tables, 12 relations).

### Master tables (exposed in v1.1)

| Table | Rows | Purpose |
|---|---:|---|
| `companies` | 190,692 | Root entity. Deduped by `(name_normalized, zip)`. Carries name/county/EE/vertical/NAICS + ICP signals (`has_5500`, `has_health_carriers`, `multi_state_likely`, `fed_contractor`, `growth_signal`, `pitch_signal`, `pitch_angle`) + lifecycle flags (`disqualified`, `disqualify_reason`). |
| `contacts` | 4,059 | DMs / owners / brokers / CPAs per company. `is_primary` marks the active outreach contact. |
| `carriers` | 15,798 | Schedule A health carriers per company. Bulk-loaded from DOL Form 5500 — most rows have a NULL `benefit_type` (v1.2 backfill needed). |
| `triggers` | 955,846 | Every buying signal that has fired (WC renewal, OSHA, hiring velocity, ALE threshold, has-5500, displacement, foreign labor, carrier consolidation, etc.). |
| `incumbent_peo` | 1,514 | Confirmed PEO incumbents from 5500 Schedule MEP + displacement CSV. |

### Legacy tables still in active use

| Table | Rows | Purpose |
|---|---:|---|
| `cadences` | 48 | Active outreach cadences (FK'd to `companies.id` in v1.1; legacy `company_key` text retained for backward compat). Status: `active`/`warm_followup`/`completed`/`killed`/`nurture`/`DISQUALIFIED`. |
| `touches` | 237 | 4 touches per cadence (D0/D3/D7/D14, channels call/email/linkedin/drop). FK to `cadences.id`. |
| `outcomes_ledger` | 0 | Append-only outcome log. Source of truth for "this touch finished on day X" timestamps (`logged_at`). |
| `meddpicc` | 0 | Pipeline scoring per booked account. Auto-created by `logOutcome` on `meeting_booked`. |
| `buyer_cast` | 48 | Legacy fallback for primary-contact info when master `contacts` has no row. |
| `channel_brokers` | 0 | Legacy auto-recruited broker channel list. |
| `weights_current` | 15 | Learned multipliers (`trigger:wc_lapsed`, `vertical:Manufacturing`, etc.) keyed by composite `dim:key`. |
| `weekly_metrics` | 0 | Per-week KPI rollups. Populates on first Friday wrap. |

### CRM-only additive tables

| Table | Purpose |
|---|---|
| `crm_notes` | UI-authored markdown notes (separate from the master `notes` table imported from `talk_track` / `enrichment_notes`). |
| `crm_tasks` | UI-authored to-dos (separate from any future agentic task list). |
| `weekly_metrics` | (Listed above — shared between Python rollup + dashboard reads.) |

### Views

| View | Purpose |
|---|---|
| `v_today_actions` | Today's uncompleted touches joined with cadence + company + primary contact. Drives `/today`. |
| `v_active_pipeline` | MEDDPICC rows in non-terminal stages with computed `est_deal_value`. Drives `/pipeline`. |
| `v_bench_top100` | Top-100 bench accounts ordered by `SUM(triggers.score)`. Drives `/bench` (the broader 13,715-row bench query uses `getBenchPage()` directly against `companies`). |

### Migration notes — divergences from the v1 spec

The implemented Postgres schema differs from [`02-database-design.md`](./02-database-design.md) in several places that the v1.1 upgrade discovered during introspection. The current Drizzle types follow the **actual DB** (auto-introspection would have regenerated names and broken tests). v1.2 may reconcile some of these.

- **`triggers`** uses `score` / `trigger_date`, **not** `weight` / `evidence_date`. There is no `still_active` column — v1.1 treats every trigger as active. (v1.2: compute "active" from `trigger_date >= now() - interval '90 days'`.)
- **`companies`** has no `status` column. Only `disqualified` (boolean) + `disqualified_reason`. Lifecycle is inferred from cadence presence + status.
- **`incumbent_peo`** lacks `peo_canonical`. We display `peo_brand` as-is. (v1.2: add a canonicalization mapping → Insperity / TriNet / Paychex / Justworks / Questco / Other + stored column.)
- **`outcomes_ledger`** uses `trigger_type`, **not** `trigger`. The Python writer (`scripts/sync_to_neon.py`) needs to be updated to use the new column name before any new outcomes can be logged via the legacy writer (the CRM is already correct).
- **`tasks`** uses `status` text (`'open'`/`'done'`), **not** a `done` boolean. The Server Action signature exposes a boolean for ergonomics; the helper maps it.
- **`weights_current`** uses separate `dim` / `key` / `mult` columns and a synthetic `id` PK — **not** the composite `k` text PK the spec described. `getWeights()` and `/settings` coaching-weights render against the actual shape.
- **`carriers.benefit_type`** is NULL for most rows. The `getIndustryTrends()` "top health carrier" rank currently aggregates over all benefit types until v1.2 backfill lands.
- **`triggers.score`** is populated for only ~1% of rows (signal-name + evidence are universal). Bench `ORDER BY SUM(score)` works but ties are common; once `scripts/build_sales_os.py` is updated to write `score` on every row, ordering tightens.

---

## 5. Architecture Decision Records (ADRs)

### ADR-001: Server Actions over REST/GraphQL
**Status:** Accepted
**Context:** All mutations need auth + Zod + DB transactions + cache invalidation. A REST or GraphQL layer would mean duplicate boilerplate per route, an extra schema (OpenAPI / SDL), and a separate auth check.
**Decision:** Use Next.js Server Actions exclusively. Every mutating endpoint is a `"use server"` async function in `app/actions/index.ts`. RSC pages call them directly; client components call them through `<form action>` or imported references.
**Consequences:** (+) No API duplication, colocated server code, first-class CSRF via Next's cryptographic action IDs, `revalidatePath()` per action. (-) Harder to call from a future native mobile app — would need a thin REST wrapper around the same handler functions. Trade accepted for v1.

### ADR-002: Drizzle over Prisma
**Status:** Accepted
**Context:** Need a typed Postgres ORM that plays nicely with Neon's serverless driver, doesn't add a codegen step to dev loop, and supports raw SQL for the one CTE we need (`kpiSnapshot`).
**Decision:** Drizzle ORM (`drizzle-orm@0.45.2` + `drizzle-kit@0.31.10`) with `@neondatabase/serverless` HTTP driver.
**Consequences:** (+) SQL-native query builder, smaller runtime, `drizzle-kit introspect:pg` regenerates types from the live DB, and the `sql\`...\`` template handles the one CTE cleanly. (-) Less mature ecosystem than Prisma; fewer Stack Overflow answers. Accepted — DX is fine for this app's surface area.

### ADR-003: Single-user env-password auth (vs. Auth.js + DB sessions)
**Status:** Accepted
**Context:** This is a personal CRM for one rep. Auth.js + a `users` / `sessions` table is enormous overkill and adds a multi-tenant attack surface to a single-user app.
**Decision:** `APP_PASSWORD` env var → bcrypt-hashed at module load (cost 10) → verified with `bcrypt.compare`. Sessions are 32-byte hex IDs minted on login, stored in a module-level `Set<string>`, set as the `sos_session` httpOnly cookie (sameSite=lax, secure-in-prod, 30-day maxAge). Per-IP token bucket (5 attempts / 5 min) on login. `requireAuth()` redirects to `/login?from=...` if cookie absent or stale.
**Consequences:** (+) Zero DB schema for auth. Constant-time compare via bcrypt's built-in. (-) Sessions die on server restart (single-user / local; acceptable). (-) Multi-tenant requires migration to Auth.js + DB sessions — documented in spec but deliberately deferred.

### ADR-004: Tremor for charts in v1, partial SVG migration in v1.1
**Status:** Accepted with carry-over
**Context:** Pre-styled SaaS-grade KPI cards + 4+ chart types had to ship for `/dashboard` and `/today` KPIs. Building everything from raw SVG in v1 would have blocked ship.
**Decision:** Ship v1 with Tremor (`@tremor/react`) for both `/today` sparklines and `/dashboard` charts. Step 7 perf review showed Tremor sparklines pulled ~128 KB of Recharts (D3 + d3-shape + d3-path + react-smooth) onto `/today`'s first-load JS, so the fix agent replaced them with hand-rolled SVG `<polyline>` (`src/components/ui/sparkline.tsx` + `ui/area-chart.tsx`, ~210 LOC total). v1.1 also swapped `/dashboard`'s area chart. BarChart + DonutChart on `/dashboard` are still Tremor.
**Consequences:** (+) Ship velocity in v1; design parity with Linear/Attio. (-) Tremor v3 still pins React 18 / 19-rc, forcing `--legacy-peer-deps` on every install. (-) Remaining Tremor footprint on `/dashboard` is v1.2 work — projected another ~120–180 KB JS saved when fully removed.

### ADR-005: Python migration script + Drizzle going forward
**Status:** Accepted
**Context:** The one-time bootstrap had to ingest 5 local sources (pipeline.sqlite + ADP_*.xlsx + ALL_COMPETING_PEO_ACCOUNTS.csv + _sales_os_state.json + Trigger_Engine_Output.xlsx), dedupe across them, and apply ICP/territory gates that mirror `scripts/build_sales_os.py`. That logic already exists in Python; rewriting it in TypeScript would have doubled the bug surface.
**Decision:** Split the tooling. The Python `scripts/migrate_to_neon.py` (1,598 LOC) creates schema and does the bootstrap. Going forward, schema changes flow through Drizzle (`drizzle-kit generate` + `drizzle-kit migrate`). Sunday-night refresh keeps using `build_sales_os.py` + `sync_to_neon.py` (idempotent UPSERTs that don't touch CRM-owned columns).
**Consequences:** (+) Reuses battle-tested Python ICP logic; CRM doesn't have to re-implement scoring rules. (+) Two-writer model with clear ownership (Python owns master + cadences; CRM owns outcomes / notes / tasks / meddpicc / brokers). (-) Schema-of-record is described in two places — `02-database-design.md` (spec) and the live Neon DB (actual). v1.2 reconciliation TBD.

### ADR-006: Local-only deploy for v1 (vs. immediate Vercel)
**Status:** Accepted
**Context:** Step 7 security audit found that the live Neon URL + default `APP_PASSWORD=adppeo2026` were in `.env.local`, both rotatable but not yet rotated. Shipping to Vercel without rotating = credentials leak.
**Decision:** Ship v1 to `localhost:3000` only. CI runs verify-only (typecheck + tests + build) — no `vercel deploy` step. Document the full deploy path in `crm/RUNBOOK.md` and `08-deployment.md` with a pre-deploy checklist that requires (a) Neon password rotation, (b) `APP_PASSWORD` change, (c) `127.0.0.1` bind verification, (d) CSP header uncomment in `vercel.ts.example`.
**Consequences:** (+) Zero risk of credential leak during the build-and-ship phase. (+) Nick chooses when to go public. (-) No staging URL for teammates to preview — `RUNBOOK.md` documents the `npx vercel` flow for when that becomes necessary.

### ADR-007: Keeping legacy `buyer_cast` / `channel_brokers` alongside new master schema
**Status:** Accepted
**Context:** When the v1.1 schema upgrade landed, the existing `buyer_cast` and `channel_brokers` tables still received writes from `scripts/sync_to_neon.py` (the Sunday rebuild). Dropping them would have broken the Sunday refresh. Migrating `sync_to_neon.py` to write into master `contacts` / `brokers` was out of v1.1 scope.
**Decision:** Both schemas coexist. Master `contacts` is preferred for primary-DM lookups; `buyer_cast` is the fallback when no master row exists (`getPrimaryDm()` in `src/lib/queries.ts` handles the union). v1.2 will migrate `sync_to_neon.py` to write into master tables and retire the legacy ones.
**Consequences:** (+) Sunday rebuild keeps working with zero Python changes. (+) CRM reads the master schema everywhere it's populated. (-) Two sources for "who is the DM" until v1.2 (the fallback resolver hides the complexity from UI code). (-) `triggers.weight` column was renamed to `score`; outcome writers on the Python side need to use `outcomes_ledger.trigger_type` (not `trigger`) before any new outcomes can be logged from Python.

---

## 6. Workflow guide for Nick

Cross-reference [`crm/RUNBOOK.md`](../crm/RUNBOOK.md) for the deep technical detail. This is the operational rhythm.

### Monday morning (office, 10:00–14:30)

1. Open `http://localhost:3000/today`. KPIs (Touches/45, Active/50, Meetings/3, Conversion%) load against this week's outcomes_ledger.
2. Time-block ribbon shows today's calendar: 10–14:30 office (highlighted Mon/Fri), 14:30–16:00 training (locked color), 16+ wrap.
3. Five action sections render: 🔥 Warm Followups → 🟢 Verified Emails → 📞 Cold Power Hour → 💼 LinkedIn → 🚗 Field Drops (Tue/Wed/Thu only — empty on Mon).
4. Click an email row → `mailto:` opens with prefilled body. Send it. Back in CRM, click "Log outcome" on the row → drawer slides in from right → choose outcome (`no_answer` / `voicemail` most common at D0) → submit. Optimistic UI removes the row immediately; sonner toast confirms.
5. Phone rows: click → `tel:` dials. Same logging flow.
6. If you capture a broker name during a touch, include it in the broker field — auto-creates a `brokers` row.

### Tuesday / Wednesday / Thursday (field, 10:00–14:30)

1. Phone-responsive `/today` is the field view. Field drop section now populated for that day's route (Tue = Pitt area, Wed = Northern, Thu = Cumberland — driven by cadence's `route_day` set by `routeDayForCounty(county)`).
2. Drop visit → Cmd+L from phone → drawer → log outcome on the spot.
3. Cmd+K (mobile: long-press header) opens command palette — fuzzy-find any account by name + DM + county. Live-search hits `/api/typeahead` for queries beyond the indexed top-200.
4. Account drill-in (`/accounts/[id]`) on phone shows tabs: Overview, Touches, MEDDPICC, Notes, Tasks, Buyer Cast, Activity. The new "Signals & Carriers" section underneath Overview lists active triggers + Schedule A carriers + incumbent PEO history — that's the master schema, 13,715-prospect universe in your pocket.

### Friday wrap (office, 09:00–10:00 + after)

1. `/dashboard`: weekly KPIs vs. target (touches/day area chart, conversion-by-trigger bar, portfolio donut, meetings-by-week bar). Industry Trends panel shows per-vertical signal velocity. Coaching card prescribes 3 adjustments derived from `weights_current`.
2. `/pipeline`: kanban view of `meddpicc` rows. Drag (or per-card select) to advance stages. Stage transitions are guarded server-side (no `closed_won → discovery_scheduled`).
3. For any booked meeting from this week, fill the 8 MEDDPICC fields on the account detail page (auto-save on blur).
4. `/settings`: review learned weights (`dim:key` table). Density toggle is a stub in v1; theme toggle works.

### Sunday night refresh

```bash
cd "/Users/ricknini/Documents/ADP PEO"
python3 scripts/build_sales_os.py     # rebuilds active cadences from triggers + outcomes
python3 scripts/sync_to_neon.py       # idempotent UPSERT into legacy cadence/touches tables
```

Then Monday morning verify in CRM: `/today` should reflect the new cadence batch; `/bench` should show top-scored qualified prospects (~13,715 universe).

---

## 7. Known limitations + v1.2 backlog

Consolidated from every prior doc. Loosely prioritized.

### Pre-deploy gates (must-fix before any public URL)

1. **Rotate Neon database password** — current cred (`npg_Ud7s1GKtLBlC...`) appeared in Step 7 audit transcripts. Neon console → Settings → Reset password → update `crm/.env.local` `DATABASE_URL`. *User action.*
2. **Change `APP_PASSWORD`** in `crm/.env.local` from placeholder `adppeo2026` to 12+ chars (mixed case + digit + symbol). Restart dev server (bcrypt hash recomputes on boot). *User action.*
3. **Bind dev server to 127.0.0.1** — `PORT=3000 HOSTNAME=127.0.0.1 npm run dev`. Next 16 defaults to `0.0.0.0`; LAN exposure is undesirable for v1. *User action.*
4. **HTTP security headers (CSP)** — block ready to uncomment in `crm/vercel.ts.example`. Needed before first Vercel prod deploy.

### Performance carry-overs

5. **Tremor BarChart + DonutChart on `/dashboard`** — still ~120–180 KB of Recharts. Same SVG-swap recipe as `/today`'s sparkline and `/dashboard`'s AreaChart. Easy v1.2.
6. **`triggers.still_active` not populated** — v1.1 treats every trigger as active. Backfill from `trigger_date >= now() - interval '90 days'` or update the writer in `scripts/build_sales_os.py`.
7. **`triggers.score` only ~1% populated** — bench ORDER BY currently surfaces many tied-zero rows. Fix in the Python writer.
8. **Missing indexes** on `touches.scheduled_for / completed` + `outcomes_ledger.week_start / outcome`. Premature at 237 rows; do before scaling.

### Data-quality carry-overs

9. **`incumbent_peo.peo_canonical` not mapped** — currently displaying raw `peo_brand`. Add canonicalization (Insperity / TriNet / Paychex / Justworks / Questco / Other) + stored column.
10. **`carriers.benefit_type` mostly NULL** — top-health-carrier rank in `getIndustryTrends()` is approximate. Backfill from DOL source.
11. **`outcomes_ledger.trigger` rename to `trigger_type`** — CRM is correct; the Python writer (`scripts/sync_to_neon.py`) still uses the legacy column name. Must update before any new outcomes are logged via the Python path.
12. **Legacy `buyer_cast` / `channel_brokers` coexistence** — retire once `sync_to_neon.py` writes into master `contacts` / `brokers`.

### Codebase hygiene

13. **`middleware.ts` → `proxy.ts` rename** (Next 16 cosmetic deprecation; one warning per build).
14. **Two moderate postcss CVEs** (transitive via `next/node_modules`). Address when Next 16 patches land — or `npm overrides` in `package.json`.
15. **Tremor v3 React peer-dep mess** — fully removing Tremor (item 5) unblocks dropping `--legacy-peer-deps`.

### Feature backlog

16. **Bulk actions on accounts table** — checkbox column + handlers already scaffolded; wire them up.
17. **Density toggle in `/settings`** — stub present, finish.
18. **Mapbox route view** — falls back to ordered list when no `MAPBOX_TOKEN`. Add the actual map view.
19. **Structured logging (Axiom / Sentry)** — currently `console.error` only. Wire before scaling beyond solo use.
20. **Pulse rail asymmetry** — initial SSR fetches 8 rows; polling endpoint returns 5. Cosmetic.

---

## 8. Test plan for accepting the handoff

A teammate (or future Nick) should be able to clone the repo and verify the CRM works end-to-end in under 15 minutes. Detailed steps in [`crm/RUNBOOK.md`](../crm/RUNBOOK.md); this is the acceptance checklist.

### Setup (one-time)

```bash
git clone https://github.com/njrini99-code/prospect.git
cd prospect/crm
cp .env.local.example .env.local        # fill in DATABASE_URL + APP_PASSWORD
npm install --legacy-peer-deps           # Tremor v3 peer-dep
npm run dev                              # http://localhost:3000
```

### Build / type / test gates

```bash
npx tsc --noEmit         # clean
npm test -- --run        # 242 passing (9 files, ~3s)
npm run build            # clean, 12 routes prerender
```

### Smoke tests (5 min)

1. Visit `http://localhost:3000` → redirects to `/login`.
2. Enter `APP_PASSWORD` → redirected to `/today`. Cookie `sos_session` is set (httpOnly).
3. `/today` renders 4 KPI cards (Touches/45, Active/50, Meetings/3, Conversion%) and 5 action sections.
4. Click any action row → drawer opens → choose outcome `no_answer` → submit. Toast appears bottom-right. Row disappears from list (optimistic).
5. Refresh `/today` → row stays gone. Open `/accounts/[id]` for that row's account → Activity tab shows the new outcome.
6. `Cmd+K` → palette opens → type 3 chars of a company name → live results populate. Enter on one → navigates to `/accounts/[id]`.

### v1.1 surface verification

7. `/bench` → loads ~13,715 rows (paginated 50/page). Filter chips work: county, vertical, has-health, multi-state, growth tier, min score.
8. `/accounts/[id]` → Overview tab shows the new "Signals & Carriers" section (active triggers + Schedule A carriers + incumbent PEO history). Each renders with color-coded badges.
9. `Cmd+K` → search a company name that is **not** in active cadences (e.g. any 11–55 EE NC manufacturer outside the 48-row cadence list). It should still appear — confirms the typeahead is hitting the master `companies` table, not just the cadence cache.
10. `/pipeline` → drag (or per-card select) a `discovery_scheduled` card to `discovery_held` → succeeds. Try dragging `closed_won` (if any exists) → rejected with toast `invalid stage transition: closed_won -> ...`.

### Coverage targets (acceptance)

- ✅ `npm test`: **242 passing** across 9 files.
- ✅ `npx tsc --noEmit`: clean.
- ✅ `npm run build`: clean, 12 routes prerender.
- ✅ Smoke tests 1–6: all green.
- ✅ v1.1 verifications 7–10: all green.

If any of those fail on a fresh clone, the most likely cause is:
- Step 1 fail → `DATABASE_URL` wrong or Neon project paused.
- Step 2 fail → `APP_PASSWORD` env var missing or empty.
- Step 7 fail → migration hasn't run; execute `python3 scripts/migrate_to_neon.py --fresh` from the workspace root.

---

## Closing notes

The orchestrator's nine-step run is complete: requirements → design → architecture → DB migration → backend → frontend → review → fix → v1.1 schema upgrade → deploy config → this handoff. The CRM ships to `localhost:3000` in a verifiable, tested, documented state.

What this build is not: a multi-tenant SaaS, an Apollo-grade enrichment engine, or a replacement for the existing Excel workbook (which Nick keeps as fallback per `CLAUDE.md`). What it is: a single-user operating system that surfaces the right account at the right moment, anchored to Nick's actual schedule + cadence + ICP — converting the 190K-company / 955K-trigger data lake into one queue per day.

Three things wait for Nick before this leaves the laptop:
1. **Rotate Neon password.**
2. **Change `APP_PASSWORD`.**
3. **Bind dev server to `127.0.0.1`.**

After that, everything is a `npm run dev` and a Monday morning away.
