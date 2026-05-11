# Architecture: ADP PEO Sales OS CRM

## Backend Architecture

### Layering

```
┌────────────────────────────────────────────────────────────┐
│                  Next.js 16 App Router                     │
│                                                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Pages (RSC by default — fetch on the server)        │  │
│  │  /today  /accounts  /accounts/[id]  /pipeline ...    │  │
│  └────────────┬──────────────────────┬──────────────────┘  │
│               │                      │                      │
│               ▼                      ▼                      │
│  ┌────────────────────────┐  ┌─────────────────────────┐   │
│  │  db/queries.ts (read)  │  │ app/actions/*.ts (write)│   │
│  │  Drizzle SELECT helpers│  │ "use server" mutations  │   │
│  └────────────┬───────────┘  └──────────┬──────────────┘   │
│               │                          │                  │
│               └──────────┬───────────────┘                  │
│                          ▼                                  │
│              ┌─────────────────────────┐                    │
│              │  db/schema.ts (Drizzle) │                    │
│              │  + db/client.ts (Neon)  │                    │
│              └────────────┬────────────┘                    │
└──────────────────────────┼─────────────────────────────────┘
                           │
                           ▼
                ┌────────────────────┐
                │  Neon Postgres 17  │
                │  (12 tables, 3 views)  
                └────────────────────┘
```

### API design (Server Actions only — no REST/GraphQL)

All mutations live in `app/actions/*.ts` and use the `"use server"` directive. They:
1. Validate input with Zod
2. Authenticate via cookie check (`requireAuth()` helper)
3. Execute Drizzle write inside a transaction
4. Return a small `{ ok: true }` or `{ ok: false, error: string }` shape
5. Call `revalidatePath()` for cache invalidation

```typescript
// app/actions/touches.ts
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { touches, outcomesLedger, companies } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth } from "@/lib/auth";

const LogOutcomeInput = z.object({
  touchId: z.number().int().positive(),
  outcome: z.enum([
    "no_answer", "voicemail", "gatekeeper", "owner_convo",
    "meeting_booked", "meeting_held", "meeting_cancelled",
    "meeting_no_show", "disqualified", "not_interested",
    "dnc", "wrong_number", "dead", "acquired", "nurture_90d",
  ]),
  notes: z.string().max(2000).optional(),
  brokerCaptured: z.string().max(120).optional(),
});

export async function logTouchOutcome(input: z.infer<typeof LogOutcomeInput>) {
  await requireAuth();
  const parsed = LogOutcomeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid input" };

  const { touchId, outcome, notes, brokerCaptured } = parsed.data;

  await db.transaction(async (tx) => {
    // Mark touch completed
    const [t] = await tx
      .update(touches)
      .set({ completed: true, outcome, notes, brokerCaptured, completedAt: new Date() })
      .where(eq(touches.id, touchId))
      .returning({ cadenceId: touches.cadenceId, channel: touches.channel });

    // Append to ledger
    const cad = await tx.query.cadences.findFirst({
      where: (c, { eq }) => eq(c.id, t.cadenceId),
    });
    await tx.insert(outcomesLedger).values({
      touchId,
      companyId: cad!.companyId,
      weekStart: getWeekStart(),
      channel: t.channel,
      outcome,
      brokerCaptured,
      notes,
    });

    // Touch companies.last_updated
    await tx.update(companies).set({ lastUpdated: new Date() }).where(eq(companies.id, cad!.companyId));
  });

  revalidatePath("/today");
  revalidatePath(`/accounts/${cad!.companyId}`);
  return { ok: true };
}
```

### Service layer responsibilities

| Module | Responsibility |
|---|---|
| `db/queries.ts` | All SELECTs. Pure functions that return typed results. No side effects. |
| `app/actions/touches.ts` | Touch logging, outcome routing (kill → disqualify, nurture → enqueue, meeting → init MEDDPICC) |
| `app/actions/notes.ts` | Add/edit/delete notes + tasks |
| `app/actions/cadences.ts` | Promote bench → active, change route_day, manual disqualify |
| `app/actions/meddpicc.ts` | Stage transitions (kanban drag-and-drop), per-field updates |
| `app/actions/auth.ts` | Login, logout (env-password compare) |
| `lib/scoring.ts` | The score-overlay logic (mirror of Python `score_overlay`) — used at promote-time + in the score-breakdown viz |
| `lib/cadence.ts` | `buildTouchSchedule(startDate, routeDay)` — mirrors Python; touched only when seeding new cadences via promoteToActive |
| `lib/auth.ts` | `requireAuth()` for actions, `getSession()` for layouts |

### Authentication & authorization

- **Single-user app.** No accounts table, no signup.
- **Login flow:**
  1. POST to `/login` (form) → Server Action calls `compare(password, hash)` where hash is `bcrypt.hash(APP_PASSWORD, 10)` computed at startup
  2. Set httpOnly cookie `sos_session=<random_32_byte_hex>` with `Secure`, `SameSite=Lax`, 30-day expiry
  3. `requireAuth()` reads the cookie, looks up against an in-memory Set (single-process); on mismatch → redirect to `/login`
- **Middleware** (`middleware.ts`) protects every route except `/login` + `/api/health` + static assets
- **CSRF protection** — Server Actions are protected by Next.js's built-in origin check + cryptographic action ID. No additional library needed.

### Integration points

| External / existing | How CRM connects |
|---|---|
| **Neon Postgres** | `@neondatabase/serverless` driver via `drizzle-orm/neon-http` |
| **`build_sales_os.py` (Python)** | Both processes write to the same Postgres. Python keeps the JSON state as cache; CRM treats Postgres as source of truth. Sunday-night re-runs of Python should call `sync_to_neon.py` which UPSERTs (not TRUNCATE) so CRM-side edits (notes, MEDDPICC, tasks) survive. |
| **Excel workbook** | CRM does NOT read or write Excel. Excel is a fallback view for Nick, regenerated by Python. |
| **Google Sheets** | CRM does not integrate. The Sheets export already exists as a separate one-shot artifact. |
| **`pipeline.sqlite`** | Read-only during one-time migration. CRM never touches it after. |

## Frontend Architecture

### Routing structure

```
app/
├── layout.tsx                    Root layout: theme provider, fonts, toaster
├── (auth)/
│   └── login/
│       └── page.tsx              Public login page
├── (app)/                        Protected layout (auth check)
│   ├── layout.tsx                Sidebar + topbar + cmd palette
│   ├── today/
│   │   └── page.tsx              FLAGSHIP — daily plan
│   ├── accounts/
│   │   ├── page.tsx              Table + filters
│   │   └── [id]/
│   │       └── page.tsx          Account drill-in
│   ├── pipeline/
│   │   └── page.tsx              MEDDPICC kanban
│   ├── bench/
│   │   └── page.tsx              700+ bench browser
│   ├── dashboard/
│   │   └── page.tsx              Weekly KPIs + charts
│   └── settings/
│       └── page.tsx              Weights + theme + export
└── actions/
    ├── touches.ts
    ├── notes.ts
    ├── tasks.ts
    ├── cadences.ts
    ├── meddpicc.ts
    └── auth.ts

components/
├── ui/                           shadcn primitives (button, card, etc.)
├── layout/
│   ├── sidebar.tsx               Icon nav with active-state indicator
│   ├── topbar.tsx                Breadcrumbs + Cmd+K hint + theme toggle
│   └── command-palette.tsx       Global fuzzy search + page nav (cmdk)
├── today/
│   ├── kpi-row.tsx               4 Tremor KPI cards with sparklines
│   ├── time-ribbon.tsx           Horizontal day visualization
│   ├── action-section.tsx        Reusable per-section list (warm/email/phone/etc.)
│   ├── action-row.tsx            Single account row with inline-edit affordances
│   └── pulse-rail.tsx            Right-rail recent activity (polling)
├── accounts/
│   ├── accounts-table.tsx        TanStack table, virtualized
│   ├── account-filters.tsx       Filter pills (nuqs URL state)
│   ├── account-hover-card.tsx    Row hover preview
│   └── saved-views.tsx           "Warm" "Mon batch" etc. quick filters
├── account-detail/
│   ├── header.tsx                Big name, pills, "Take Action" button
│   ├── tabs.tsx                  Overview / Touches / MEDDPICC / Notes / Tasks / Buyer Cast / Activity
│   ├── overview-grid.tsx
│   ├── score-breakdown.tsx       Right-rail stacked bar of score components
│   ├── touch-timeline.tsx        Vertical timeline w/ avatars
│   ├── meddpicc-form.tsx         Edit-in-place 8 fields
│   └── notes-editor.tsx          Markdown textarea w/ auto-save
├── pipeline/
│   ├── kanban-board.tsx          dnd-kit columns
│   └── kanban-card.tsx
├── bench/
│   ├── bench-table.tsx
│   └── promote-button.tsx        Move bench → active
├── dashboard/
│   ├── kpi-grid.tsx
│   ├── touches-chart.tsx         Tremor area
│   ├── conversion-by-trigger.tsx Tremor bar
│   ├── portfolio-mix.tsx         Tremor donut
│   └── coaching-card.tsx
├── touch-logger/
│   ├── logger-drawer.tsx         Sheet from right; called from anywhere
│   └── outcome-selector.tsx
└── shared/
    ├── score-cell.tsx            Heatmap-colored numeric cell
    ├── trigger-badge.tsx         Color-coded per trigger type
    ├── peo-badge.tsx             Color-coded per incumbent
    └── signal-flags.tsx          💰 🌐 📈 inline indicators

db/
├── client.ts                     drizzle({ ... }) singleton
├── schema.ts                     12 tables + view types
└── queries.ts                    All SELECT helpers

lib/
├── auth.ts                       requireAuth, getSession
├── scoring.ts                    Mirror of Python score_overlay (used for score breakdown viz)
├── cadence.ts                    buildTouchSchedule(startDate, routeDay)
├── date.ts                       getWeekStart, formatDate
└── utils.ts                      cn() etc.

styles/
└── globals.css                   Tailwind directives + emerald accent overrides

middleware.ts                     Auth gate for /(app)
```

### State management

- **Server state** = Postgres. Read via RSC + Drizzle, mutate via Server Actions, invalidate via `revalidatePath`.
- **URL state** = `nuqs` for filters (accounts/bench). Saved-view buttons just set URL params.
- **Local UI state** = `useState` for collapsibles, drawer-open, command-palette-open.
- **Optimistic state** = `useOptimistic()` on touch logging — the row immediately shows the outcome while the Server Action races.
- **No client-side query cache** — Server Actions + `revalidatePath` are enough for this scale.

### Data fetching strategy

| Component | Pattern |
|---|---|
| `app/(app)/today/page.tsx` | RSC, `await getTodayActions()` |
| `app/(app)/accounts/page.tsx` | RSC, reads filters from `searchParams`, calls `searchAccounts(filters)` |
| `app/(app)/accounts/[id]/page.tsx` | RSC + parallel data fetching with `Promise.all` for the 7 tabs' data |
| `app/(app)/pipeline/page.tsx` | RSC, `getPipelineByStage()` returns columns of cards |
| `app/(app)/bench/page.tsx` | RSC with `searchParams` for filters; pagination via URL |
| `app/(app)/dashboard/page.tsx` | RSC, parallel `Promise.all` for each chart's data query |
| Components inside protected layout | Receive data as props from the page; no client fetching |
| `pulse-rail.tsx` (today right-rail) | Client component; polls every 30s via `fetch` to a tiny RSC endpoint (`/api/pulse`) |
| Command palette search | Server Action `searchAccountsTypeahead(q)` debounced 200ms |

### Routing & route guards

- `(auth)` group has its own layout — no auth check.
- `(app)` group has a layout that calls `requireAuth()` at the top; redirects to `/login` if cookie invalid.
- `middleware.ts` does the cookie check at the edge so unauthenticated requests don't even hit the RSC render.

### Optimistic UI examples

- **Touch outcome logged** → row immediately strikes through + shows outcome badge. If server fails, toast error + revert.
- **MEDDPICC stage change** → kanban card moves instantly to new column. Background server action; on error, snap back.
- **Disqualify** → row fades out of the active list immediately; ledger entry written in background.

## Cross-cutting concerns

### Error handling

- **Server-side errors** in Server Actions: caught, logged with `console.error`, returned as `{ ok: false, error: "human-readable" }`. UI shows a sonner toast with the error text.
- **Page-level errors** caught by `error.tsx` boundary per route group → friendly fallback with "go back" + "report this" actions.
- **Not found** (e.g. `/accounts/9999999`) handled by per-route `not-found.tsx` with link back to the accounts list.
- **Network / Neon outages** — RSC will throw; the route group's `error.tsx` shows a "database unreachable" panel with a retry button.

### Security considerations

| Risk | Mitigation |
|---|---|
| SQL injection | Drizzle parameterizes everything; no raw SQL except in a single migration helper that takes no user input |
| XSS | React escapes by default; markdown notes rendered via `react-markdown` with `rehype-sanitize`; no raw-HTML insertion APIs anywhere in the app |
| CSRF | Next.js Server Actions enforce origin check + cryptographic action ID (built-in) |
| Open redirect on login | After login, redirect target is whitelisted to internal paths only |
| Session theft | Cookie is httpOnly + Secure + SameSite=Lax; 30-day rotating session ID |
| Credentials in logs | DATABASE_URL never echoed; bcrypt hash never logged; no `console.log(process.env)` |
| Data leakage to git | Whitelist `.gitignore` — only commits scripts + README + crm code (no `.env`, no state files) |
| Dependency vulnerabilities | `npm audit --omit=dev` in CI later; for now manual review of top-level deps only |
| Brute-force login | Rate-limit `/login` Server Action to 5 attempts per IP per 5 minutes (in-memory token bucket) |
| Local-only deployment | Bind dev server to 127.0.0.1 only; documented in README that exposing this publicly requires extra hardening |

### Performance

- All page renders are RSC — no client JS for initial paint of data
- Bench table is virtualized (only render visible rows)
- Touch logging is optimistic (no perceived latency)
- Score breakdown viz computed server-side and passed as JSON
- No image-heavy pages; small bundle size target (<150 KB JS per route)
- Tremor charts are tree-shaken; Recharts imports limited
- Neon HTTP driver = no connection pool overhead in dev

### Observability (v1 — minimal)

- `console.error` on Server Action errors
- A `/api/health` endpoint returns `{ ok: true }` if DB query succeeds (`SELECT 1`)
- Future: structured logs to a sink (Axiom / Logflare) when deployed

## Risk assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Migration takes > 60 s for 191K companies | Medium | Low | Chunked INSERT, progress logging, can resume |
| Drizzle schema drifts from migration script | Medium | Medium | Generate Drizzle schema from `drizzle-kit introspect:pg` against the live DB after migration; check in |
| Nick installs Node 18 and Next.js 16 fails | Low | Medium | README pins Node 24 LTS; check version in `package.json` engines |
| Touch-logger shortcut conflicts with system shortcuts (Cmd+L = address bar focus) | Medium | Low | Use Cmd+Shift+L instead; document |
| Outcome routing diverges between Python orchestrator and CRM | High | High | Single source of truth: CRM writes the outcome → Python reads from `outcomes_ledger` on Sunday rebuild. Never write outcomes from Python. |
| User locks themselves out by setting wrong APP_PASSWORD | Low | Low | Documented recovery: edit `.env.local`, restart dev server |
| Background agents produce conflicting schemas | High | High | Schema-design doc (this set) is the source of truth; both agents read it; checkpoint before integration |
| Print stylesheet looks bad | Medium | Low | Dedicated `@media print` in globals.css; tested manually |
| Mobile breaks in field (no signal in rural counties) | Medium | Low | Touch logger drawer cached eagerly; queue mutation locally if fetch fails; sync when online (deferred to v2) |
| Demo creds in `.env` leak via git | Low | Critical | `.gitignore` whitelist + `git check-ignore` verification documented |

## Decision log

1. **Server Actions over REST** — single-codebase + first-class CSRF + colocated server code + less boilerplate. Trade-off: harder to call from a future mobile app. Mitigation: if mobile happens, generate REST endpoints from the same action functions.
2. **Drizzle over Prisma** — smaller runtime, no codegen step at dev time, SQL-native query builder, perfect Postgres support. Trade-off: less mature ecosystem; we accept.
3. **Tremor over Recharts directly** — pre-styled dashboard components, faster build. Trade-off: design lock-in; we accept because matching the SaaS aesthetic.
4. **Single-user env-password auth** — simplest viable security for a local-only personal CRM. Trade-off: not multi-tenant; document upgrade path to Auth.js + database sessions for future.
5. **No image assets / no avatars** — keep bundle tight; use initials in colored circles.
6. **Print stylesheet** — Nick literally prints `/today` for field drops; non-optional.
7. **Cmd+K everywhere** — Linear's UX is the bar. Without it the app feels like a spreadsheet.
8. **MEDDPICC kanban drag-and-drop** — Pipedrive-style stage transitions are intuitive and signal craftsmanship.

## Open questions to resolve at checkpoint 1

- [ ] Confirm `APP_PASSWORD` env var name (alt: `ADMIN_PASSWORD`, `LOGIN_PASSWORD`) — staying with `APP_PASSWORD`.
- [ ] Confirm Mapbox is optional in v1 — yes, route view falls back to static list if no token.
- [ ] Density toggle in settings — defer to v1.1 unless trivial.
- [ ] Bulk-action in accounts table — defer to v1.1 unless trivial.

---

**This concludes Phase 1.** Two background agents are already producing the implementation artifacts (migration script + Next.js scaffold). On user approval at Checkpoint 1, Steps 4–6 deliverables (implementation summaries) get written from their outputs, then Step 7 (testing) and Phase 3 (deploy + docs) follow.
