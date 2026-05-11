# Requirements: ADP PEO Sales OS — Full Local CRM

> Synthesized from established conversation context (rep schedule, ICP scoring decisions, cadence shape, data sources). Q&A skipped because all 6 question domains were already answered across prior turns in this session.

## Problem Statement

Nick is a solo ADP TotalSource (PEO/HRO) sales rep working a 35-county eastern North Carolina territory. He has ~6 weeks of run-up and a hard target of **closing 1 deal in 30 days** (and 3 booked meetings per week sustained). Today his workflow is fragmented across:

- A 16-tab Excel workbook (`Sales_OS_MASTER.xlsx`) he edits manually
- A Google Sheets export he pastes into for daily plans
- A SQLite database (`pipeline.sqlite`, 191K companies + 1M+ enrichments)
- A `_sales_os_state.json` file with 48 active cadences and outcome history
- Several territory CRM Excel files (his + 3 teammates) with prospect data
- A Neon Postgres database that received a first snapshot earlier today

**The pain:** logging touches in Excel is friction; the Google Sheet doesn't scale beyond ~30 rows; there's no quick way to drill into an account's full history; no command palette / keyboard navigation; visually it looks like a glorified spreadsheet, which doesn't match his ambition.

**The user (Nick):** in office Mon 10:00–14:30 + Fri 09:00–10:00 + after; in the field Tue/Wed/Thu 10:00–14:30 (drops + booked meetings); training daily 14:30–16:00 (locked). Per-day touch target: ~10 Mon, 12–15 each field day, 8 Fri.

**The opportunity:** he has more data than any solo rep in the territory. A purpose-built CRM that surfaces the right action at the right moment — anchored to his real schedule, his cadence model, and his refined ICP — converts that data advantage into booked meetings.

## Acceptance Criteria

- [ ] **AC-1:** Local Next.js 16 app runs with `npm run dev` after `pnpm install` and a working `.env.local`.
- [ ] **AC-2:** All local prospect data (pipeline.sqlite + ADP_*.xlsx + ALL_COMPETING_PEO_ACCOUNTS.csv + _sales_os_state.json + Trigger_Engine_Output.xlsx + verification_V2.json if present) is migrated into Neon Postgres via `scripts/migrate_to_neon.py`. Dedupe across sources by normalized name + zip5.
- [ ] **AC-3:** 12-table Postgres schema exists with: `companies`, `contacts`, `carriers`, `triggers`, `incumbent_peo`, `cadences`, `touches`, `outcomes_ledger`, `notes`, `tasks`, `meddpicc`, `brokers`, `weights_current`, `weekly_metrics` (+ helper views).
- [ ] **AC-4:** Eight working pages — `/login`, `/today` (flagship), `/accounts`, `/accounts/[id]`, `/pipeline` (kanban), `/bench` (700+ trigger accounts), `/dashboard`, `/settings`.
- [ ] **AC-5:** `/today` shows today's actions segmented by 🔥 warm followups, 🟢 verified email sends, 📞 phone-only, 💼 LinkedIn, 🚗 field drops — each item with one-click action.
- [ ] **AC-6:** Touch logger drawer callable from anywhere (Cmd+L) — channel + outcome + notes + broker captured. Optimistic UI, toast confirmation, server-action mutation.
- [ ] **AC-7:** Command palette (Cmd+K) — fuzzy search any company, jump to any page, log a quick outcome.
- [ ] **AC-8:** Score visualization on `/accounts/[id]` — visual breakdown of raw + overlay components.
- [ ] **AC-9:** MEDDPICC pipeline kanban view with drag-and-drop between stages.
- [ ] **AC-10:** Weekly dashboard with KPI cards + 4+ Tremor charts (touches/day, conversion by trigger, portfolio mix, meetings by week).
- [ ] **AC-11:** Single-user auth via `APP_PASSWORD` env var with httpOnly cookie. Login page is the only public route.
- [ ] **AC-12:** Dark mode default with light toggle. Emerald accent. Linear/Attio aesthetic — NOT spreadsheet look.
- [ ] **AC-13:** Vitest unit tests (≥20) covering server actions and score-overlay logic.
- [ ] **AC-14:** Playwright e2e for login → today → log outcome → see optimistic update.
- [ ] **AC-15:** Touch-logging round-trip (UI click → server action → DB write → revalidatePath → updated UI) completes in <800ms locally.
- [ ] **AC-16:** Print stylesheet on `/today` produces a clean one-pager for field drops.
- [ ] **AC-17:** README documents setup, daily workflow, deploy-to-Vercel-later path.

## Scope

### In Scope

- Migration ETL from all local files → Neon Postgres
- Next.js 16 application (App Router, RSC default, Server Actions for mutations)
- 8 routes listed above + the global command palette + touch-logger drawer
- Single-user authentication (env-password, httpOnly cookie)
- Drizzle schema generation + introspection
- All server actions for mutations (no separate REST/GraphQL layer)
- Vitest + Playwright test suites
- Dark/light mode + density toggle
- Print stylesheet for `/today`
- Local-only operation (no deploy in this session; document the deploy path)

### Out of Scope

- Production deployment / hosting infrastructure (Nick will deploy to Vercel later)
- Multi-user / team features (single solo-rep app)
- Real email sending — emails are `mailto:` links with pre-filled bodies; no SMTP integration
- Phone dialer integration (Aircall / Dialpad) — phone numbers are `tel:` links
- LinkedIn API integration — LinkedIn URLs are clickable but no scraping
- Mobile-native app (responsive web only)
- Google Calendar integration
- Existing Excel workbook deprecation — Excel + Sales_OS_MASTER stays as fallback; CRM is additive
- Apollo MCP integration (blocked on free-plan API access)
- Multi-tenant features
- Billing / payments
- Advanced ML / forecasting beyond the existing linear weight model

## Technical Constraints

- **Existing scoring weights stay authoritative** — `build_sales_os.py` defines the trigger weights, ICP focus multiplier, and learned outcome weights. The CRM reads from Neon (which is populated by both the existing Python orchestrator and the new migration script) but must not silently override those rules.
- **NC territory filter** — only state='NC' OR zip prefix 27/28 ever enters the bench. The migration script must enforce this; the CRM trusts the DB.
- **ICP off-focus exclusions** — construction proper (NAICS 236/237), trucking (484), waste (562), most NAICS 238 specialty trades (KEEP 23821 electrical + 23822 HVAC), arts (711/712), food service (722), personal services (812), retail (445/446/448). Mirror the regex/NAICS lists in `scripts/build_sales_os.py` exactly.
- **UNC/Duke ZIPs** (27599/27710/27705/27708/27704) and **RTP-proper** (27709) are excluded — mail drops, not operating addresses.
- **Worked accounts registry dedupe** — every account in `ADP_Weekly_Pipeline_MASTER.xlsx → Worked_Accounts_Registry` plus every row in `pipeline.sqlite.drops` with reason_code IN (IN_REGISTRY, IN_CRM, IS_ADP_CLIENT, IS_COMPETING_PEO, LATE_ACQUISITION, ACQUIRED, DEAD, DOA_UNVERIFIABLE, HQ_OUT_OF_STATE, OUT_OF_TERRITORY, VIRTUAL_MAILBOX, RETAIL_NOISE, EXCLUSION_RULE, ENTERPRISE_PARENT, ABOVE_ICP_EE) must be flagged `disqualified=true` in the new `companies` table — not dropped, but visibly off-limits.
- **EE band** 11–55 (ICP 11–50 + near-ICP 51–55).
- **Latency target** — local Postgres queries < 50ms p95; Server Action round-trip < 800ms.
- **No PII leakage to git** — `.gitignore` whitelist approach already in place; never commit `_sales_os_state.json`, any `*.xlsx`, `ALL_COMPETING_PEO_ACCOUNTS.csv`, or `.env`.
- **Connection string protection** — `DATABASE_URL` reads from `.env.local` only; never echoed in logs or committed.

## Technology Stack

### Backend
- **Database:** Neon Postgres 17 (already provisioned at `ep-restless-snow-aq9wxrxa.c-8.us-east-1.aws.neon.tech`, `neondb`)
- **ORM:** Drizzle (`drizzle-orm` + `drizzle-kit`) with `@neondatabase/serverless` driver
- **Runtime:** Node.js 24 LTS (matches Next.js 16 requirements)
- **Migration runner:** Python ETL (`scripts/migrate_to_neon.py`) for the one-time data ingest from local sources; Drizzle migrations going forward
- **Server-side language:** TypeScript strict mode

### Frontend
- **Framework:** Next.js 16 App Router (RSC default, Server Actions for mutations, no separate API routes)
- **Styling:** Tailwind CSS v4 + `tailwindcss-animate`
- **Component library:** shadcn/ui (full install — button, card, dialog, sheet, dropdown, command, popover, tooltip, badge, table, tabs, input, textarea, select, switch, toggle, scroll-area, hover-card, alert, drawer, sonner)
- **Charts:** Tremor (`@tremor/react`) for KPI cards + 4+ chart types
- **Icons:** `lucide-react` (no emoji-only — emoji as accents only)
- **Command palette:** `cmdk`
- **Theme:** `next-themes` (dark default)
- **Date:** `date-fns`
- **Animations:** `framer-motion` (page transitions + micro-animations, Linear-grade restraint)
- **Forms:** `react-hook-form` + `zod` for validation
- **URL state:** `nuqs` for filter persistence
- **DnD (kanban):** `@dnd-kit/core` + `@dnd-kit/sortable`
- **Virtualization (bench):** `@tanstack/react-table` + `@tanstack/react-virtual`

### Infrastructure
- **Local dev:** `npm run dev` (Next.js dev server, hot reload)
- **Deploy target (future):** Vercel — documented in README, not executed this session
- **Auth:** httpOnly cookie, env-password compared with `bcryptjs` (constant-time compare via `crypto.timingSafeEqual` on the bcrypt hash). Single user, no session DB.
- **Observability:** Server-side `console.error` only for v1; structured logging deferred until deploy.

### Testing
- **Unit:** Vitest 3.x with `@testing-library/react`
- **e2e:** Playwright

## Dependencies

### Affects existing systems
- **`Sales_OS_MASTER.xlsx` workbook** — still authoritative for the Sunday-night batch refresh, but the CRM's `/today` page becomes the primary daily view. The Excel sync continues (`build_sales_os.py` → `sync_to_neon.py`) so both stay in sync.
- **`pipeline.sqlite` enrichment DB** — read-only source for the migration. CRM never writes back to SQLite.
- **`.env`** — adds `APP_PASSWORD` and optional `MAPBOX_TOKEN`. Existing `DATABASE_URL` and `DOL_API_KEY` unchanged.

### Depends on
- Neon Postgres connection (live, tested earlier this session)
- `psycopg[binary]` Python package (installed)
- Future: pnpm or npm for the Next.js app (Node.js 24 already present)

### Coordinates with concurrent agents
- **Migration agent** (Step 4 deliverable in flight) — produces `scripts/migrate_to_neon.py` + the actual Postgres schema. Its column names are the source of truth for the Drizzle schema.
- **Frontend agent** (Steps 5+6 deliverable in flight) — scaffolds the Next.js app at `crm/` with all 8 pages. Reads the Postgres schema once Migration completes.

## Configuration

- **Stack:** `nextjs16-tailwind4-shadcn-drizzle-neon-postgres`
- **API style:** `server-actions` (no REST/GraphQL layer — RSC + Server Actions only)
- **Complexity:** `complex` (8 routes, 12-table schema, multi-source ETL, command palette, kanban DnD, charts, auth, tests)
