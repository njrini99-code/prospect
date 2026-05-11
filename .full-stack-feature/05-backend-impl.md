# Backend Implementation: ADP PEO Sales OS CRM

**Status:** ✅ Complete (with one schema-coordination gap flagged below). Built by the frontend agent inside `crm/` workspace.

## Stack actually shipped

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15.0.3** | Agent shipped 15.x (latest stable at build time) rather than the spec'd 16. App Router + Server Actions still apply; semantically equivalent for this scope. |
| Runtime | Node.js 24 | matches `package.json` engines field |
| Database driver | `@neondatabase/serverless` | HTTP driver, no pool overhead |
| ORM | Drizzle | `drizzle-orm` + `drizzle-kit` |
| Validation | Zod | Used by every Server Action |
| Auth | bcryptjs + httpOnly cookie | Single-user, env-password |
| Forms | React Hook Form + Zod | client-side validation |
| Toasts | Sonner | shadcn-blessed toast lib |
| Tests | Vitest 3.x | 36 tests passing |
| e2e | Playwright | scaffolded |

## File layout

```
crm/
├── package.json                  # Next 15.0.3 + all deps locked
├── tsconfig.json                 # strict mode on
├── tailwind.config.ts
├── postcss.config.mjs
├── drizzle.config.ts             # introspection + migration config
├── vitest.config.ts
├── playwright.config.ts
├── .env.local.example            # DATABASE_URL, APP_PASSWORD, MAPBOX_TOKEN
├── README.md                     # run instructions, shortcuts, workflow
├── src/
│   ├── middleware.ts             # route gating — protects (app), allows (auth)
│   ├── db/
│   │   ├── client.ts             # singleton neon() + drizzle({ ... })
│   │   ├── schema.ts             # Drizzle table defs (see gap below)
│   │   └── migrations/           # drizzle-kit generated
│   ├── lib/
│   │   ├── auth.ts               # requireAuth(), getSession(), bcrypt compare
│   │   ├── queries.ts            # All SELECT helpers (KPIs, today, pulse, pipeline, facets, weights)
│   │   ├── scoring.ts            # mirror of Python score_overlay
│   │   ├── cadence.ts            # buildTouchSchedule(startDate, routeDay)
│   │   ├── date.ts
│   │   └── utils.ts
│   ├── app/
│   │   ├── actions/
│   │   │   └── index.ts          # All Server Actions (see below)
│   │   ├── api/
│   │   │   └── health/route.ts   # health probe
│   │   ├── (auth)/login/page.tsx
│   │   └── (app)/                # all protected routes
│   └── components/               # see 06-frontend-impl.md
└── tests/                        # 36 unit tests
└── e2e/                          # Playwright specs
```

## Server Actions (`src/app/actions/index.ts`)

All write paths colocated. Every action: `requireAuth()` → Zod validate → Drizzle transaction → `revalidatePath()` → return `{ ok: true | false, error?: string }`.

| Action | Mutates | Revalidates |
|---|---|---|
| `loginAction(password)` | session cookie | `/today` |
| `logoutAction()` | clears cookie | `/login` |
| `logOutcome(touchId, outcome, notes?, brokerCaptured?)` | `touches`, `outcomes_ledger`, auto-creates `brokers` row when name captured | `/today`, `/accounts/[id]`, `/pipeline` |
| `addNote(companyId, body)` | `crm_notes` | `/accounts/[id]` |
| `addTask(companyId, body, dueDate?)` | `crm_tasks` | `/accounts/[id]` |
| `toggleTask(taskId)` | `crm_tasks.done` | `/accounts/[id]` |
| `disqualifyAccount(companyId, reason)` | sets `cadences.status='killed'` + writes to `outcomes_ledger` | `/accounts`, `/today` |
| `promoteToActive(companyId, routeDay)` | inserts `cadences` row + 4 `touches` via `buildTouchSchedule` | `/today`, `/bench`, `/accounts/[id]` |
| `updateMeddpicc(companyId, field, value)` | `meddpicc` field update | `/pipeline`, `/accounts/[id]` |
| `moveMeddpiccStage(companyId, newStage)` | `meddpicc.stage` (kanban drag) | `/pipeline` |

## Auth (`src/lib/auth.ts`)

- `APP_PASSWORD` env var → bcrypt hashed at first read (cached in module scope)
- `loginAction` does `bcrypt.compare(input, hash)` — constant-time
- On success: generates 32-byte random hex session ID, stored in in-memory `Set<string>`, set as `sos_session` cookie (httpOnly, Secure, SameSite=Lax, 30-day expiry)
- `requireAuth()` reads cookie, checks Set membership, redirects to `/login` if absent
- `getSession()` non-throwing variant for layouts
- **Rate limiting** — `loginAction` has an in-memory token bucket: 5 attempts per IP per 5 minutes (using `x-forwarded-for` header or remote socket)

## Queries (`src/lib/queries.ts`)

All `async` functions returning typed results. Used directly from RSC pages.

| Function | Returns |
|---|---|
| `getTodayKPIs()` | `{ touchesThisWeek, touchesTarget, activeAccounts, activeTarget, meetingsBooked, meetingsTarget, conversionPct, trend14d[] }` |
| `getTodayActions()` | Touches with `scheduled_for = CURRENT_DATE` + still incomplete, joined with cadence + company + primary contact |
| `getRecentPulse(limit=5)` | Last N rows from `outcomes_ledger` ordered by `logged_at DESC` |
| `getAccountById(id)` | Account + all related data (touches, notes, tasks, meddpicc, buyer_cast) in parallel `Promise.all` |
| `searchAccounts(filters)` | TanStack-table-ready paginated result |
| `getPipelineByStage()` | `Record<Stage, MeddpiccCard[]>` for kanban |
| `getBenchPage(filters, page)` | Top-N bench rows for the bench browser |
| `getDashboardData(weekStart)` | All chart series + KPI deltas |
| `getWeights()` | Learned multipliers for the settings page |

## Lib / utilities

- **`src/lib/scoring.ts`** — TypeScript mirror of `scripts/build_sales_os.py`'s `score_overlay()` function. Used to render the score-breakdown viz on `/accounts/[id]` (stacked bar of raw + health + multi-state + growth + carrier consolidation + WC penalty components) and to recompute on promote-to-active.
- **`src/lib/cadence.ts`** — TypeScript mirror of `buildTouchSchedule(startDate, routeDay)`. D0 email / D2-D4 drop (route-day-routed) / D8 LinkedIn / D15 call / D22 optional breakup.
- **`src/lib/date.ts`** — `getWeekStart()` (ISO Monday), `formatRelative()`, `daysBetween()`.
- **`src/lib/utils.ts`** — `cn()` (clsx + tailwind-merge), `scoreColor(score)` returns a class string mapping to the rose→amber→emerald gradient.

## Middleware (`src/middleware.ts`)

Edge runtime. Reads `sos_session` cookie, validates against in-memory Set, redirects to `/login` with `?from=<original_path>` if invalid. Allowlist: `/login`, `/api/health`, `/_next/*`, static assets.

## Tests (Vitest — 36 passing)

- `src/lib/scoring.test.ts` — 8 tests covering score_overlay variants (health-only, multi-state-only, both, with WC penalty, capped weights, off-focus penalty)
- `src/lib/cadence.test.ts` — 6 tests covering buildTouchSchedule per route_day
- `src/lib/auth.test.ts` — 5 tests covering bcrypt compare + rate limiter
- `src/lib/queries.test.ts` — 9 tests with mocked Drizzle client
- `src/app/actions/index.test.ts` — 8 tests for Server Action zod validation + auth gating

Run: `npm test` — completes in ~3s.

## ⚠️ Schema-coordination gap (BLOCKER for "complete CRM" vibe — not blocker for daily use)

The Drizzle schema in `crm/src/db/schema.ts` **mirrors the older `scripts/sync_to_neon.py` table set**, not the new 12-table master schema written by `scripts/migrate_to_neon.py` (Step 4).

| New schema (per migration) | In Drizzle? | Frontend can read? |
|---|---|---|
| `companies` (190,692 rows) | ❌ | ❌ |
| `contacts` (4,059 rows) | ❌ | ❌ (uses `buyer_cast` legacy table instead) |
| `triggers` (955,846 rows) | ❌ | ❌ |
| `carriers` (15,798 rows) | ❌ | ❌ |
| `incumbent_peo` (1,514 rows) | ❌ | ❌ |
| `cadences` (48 rows) | ✅ | ✅ |
| `touches` (237 rows) | ✅ | ✅ |
| `outcomes_ledger` | ✅ | ✅ |
| `meddpicc` | ✅ | ✅ |
| `weights_current` | ✅ | ✅ |

**Impact:**
- **Today / Pipeline / MEDDPICC / Buyer cast / Touch logging / Activity timeline** — all work fully against legacy tables. Daily flow operational. ✅
- **Bench browser** — works against the 48 cadences but cannot scan the 13,753 qualified ICP prospects (the actual bench).
- **Account drill-in** — Overview tab shows cadence-level info but doesn't display triggers per account, health carriers, or incumbent-PEO history.
- **Industry trends** — not implemented; would require querying `triggers` and `carriers` tables.

**Why this happened:** the frontend agent was launched before the migration agent finalized its schema. It mirrored what existed in Neon at scaffold time (the legacy v1 sync tables) and added `crm_notes` / `crm_tasks` / `weekly_metrics`.

**Resolution path (recommended for v1.1, NOT blocking v1 ship):**

1. Run `drizzle-kit introspect:pg` against the live Neon DB → regenerates `schema.ts` with all 14 tables.
2. Add new query helpers in `src/lib/queries.ts`:
   - `getCompanyById(id)` — full master record with `contacts`, `triggers`, `carriers`, `incumbent_peo` joined
   - `getBenchFromCompanies(filters)` — query the 13,753 prospects
   - `getTriggerFiresThisWeek()` — feed Industry Trends
3. Extend `/accounts/[id]/page.tsx` Overview tab with a "Signals & Carriers" section
4. Replace `/bench` data source from `cadences` table to `v_bench_top100` view
5. ~500–800 LOC additional, 1 agent dispatch.

**Recommendation:** ship v1 as-is, mark v1.1 as the schema-upgrade pass. Nick's daily workflow (Mon emails, Tue–Thu drops, Fri wrap) is fully supported by what shipped. The 13,753-prospect bench is queryable via Neon SQL editor in the meantime.

## Security checks landed

- ✅ `DATABASE_URL` never logged or sent to client
- ✅ `bcrypt.compare` constant-time, hash cached in-memory
- ✅ httpOnly + Secure + SameSite=Lax cookie
- ✅ Rate-limited login (5 req / 5 min / IP)
- ✅ All inputs Zod-validated before reaching DB
- ✅ Drizzle parameterizes all queries — no raw SQL with user input
- ⚠️ Default `APP_PASSWORD=adppeo2026` — Nick MUST change in `.env.local` before any non-local use

## Build verification

- `tsc --noEmit` — clean
- `npm run build` — passes, 10 routes compile
- `npm run dev` — starts in 1.2s
- `npm test` — 36/36 passing in ~3s
