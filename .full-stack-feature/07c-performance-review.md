# 07c — Performance Review: ADP PEO CRM (Next.js 15 + Neon)

**Reviewer mode:** static code review + single `npm run build`.
**Scope:** single-user, local-dev primarily. No load-testing, no CDN/edge recs.
**Date of review:** 2026-05-11.

---

## Executive summary

| Impact | Count | Theme |
|---|--:|---|
| **High** | 4 | Bench/Accounts pull 2K/1K row payloads to client; Today's `kpiSnapshot` issues 5 round-trip Neon HTTP calls; `kpiSnapshot` filters by `last_synced` (not `logged_at`) and is semantically wrong; Tremor `AreaChart` lives in every KPI card sparkline (one chunk per card). |
| **Medium** | 8 | No `useOptimistic` despite spec claiming it; `recentPulse` does no DB-side limit on join data; `account-tabs.tsx` is a client component that forces all 7 tabs' data to ship as props on initial render; `getOutcomesForAccount` has no time bound; Pipeline query selects all `meddpicc` rows then groups in JS; sub-optimal index coverage for hot paths; `pulse-rail` advertises 30s polling but is static SSR; framer-motion is installed but not used (4 MB dead dep). |
| **Low** | 6 | `format(new Date())` in RSC defeats any future caching; `app/(app)/layout.tsx` runs a top-200-accounts query on every route render for the command palette; date-fns imports the kitchen sink; bench-table client filtering on 2K rows on each keystroke (no useDeferredValue); login page is `force-dynamic` though static would work; `console.log`/observability is silent on slow queries. |

**Net read:** the app is small (190K rows in DB, but routes fetch slices) and the architecture is sane. The biggest single win is killing **N+1-like over-fetching on Bench/Accounts** (2,000-row + 1,000-row server-to-client payloads, then virtualized/sliced on the client). After that, the **Today KPI snapshot is wrong and slow** — it joins on the wrong date column and pays 5 sequential HTTP round-trips against Neon. After that, the dashboard's Tremor bundle (19 KB route + 100 KB shared chart chunks).

The bundle sizes from `next build` are healthy for the architecture (`/today` first-load 278 KB is on the heavy side because of Tremor `AreaChart` × 4 sparkline cards). No `useEffect(fetch)` anti-patterns found.

---

## Findings table

| # | Impact | File:line | Description | Recommended fix | Est savings |
|---|---|---|---|---|---|
| 1 | **High** | `crm/src/app/(app)/bench/page.tsx:9-19` | Bench page does `SELECT * FROM cadences ... LIMIT 2000` and ships **all 2,000 rows** to the client component, which then renders ~30 visible via virtualization. With the 13,753-qualified-prospect universe, this is already over-fetching by ~30×. The browser receives every column of every row (40 cols × 2,000 = ~80,000 cells / ~1 MB of JSON over the wire). | Project only the columns the bench row renders (`companyKey, company, county, ee, incumbentPeo, primaryTrigger, score, dmName`). Page server-side with `searchParams` for filters/page-size; bench-table should accept a stable page (e.g., top 500) and the rest via a "Load more" Server Action. | -800 KB initial payload, -100ms server query time, materially faster scroll. |
| 2 | **High** | `crm/src/app/(app)/accounts/page.tsx:32-43` (`limit: 1000`) + `accounts-table.tsx:154` (`filtered.slice(0, 500)`) | Same shape as Bench. Server fetches 1,000 rows, ships all to client, client re-filters in JS and renders only 500. Anything beyond 500 is impossible to view — silently truncated. | Drop the 1,000 limit to ~250 server-side and push search into the SQL query (`listAccounts(...)` already accepts `search`). Use `nuqs` filters → server re-query rather than client-side filter on stale 1,000-row blob. | -400 KB payload, eliminates silent truncation bug. |
| 3 | **High** | `crm/src/lib/queries.ts:143-194` (`kpiSnapshot`) | (a) Issues **5 sequential `db.execute()` calls** over Neon HTTP — each is its own RTT (Neon's serverless HTTP driver does **not** pipeline). On a local network this is ~30-50ms × 5 = 150-250ms before render. (b) Filters touches by `last_synced` rather than the touch's `scheduled_for` or `completed_at`. `last_synced` reflects when the Python rebuild last touched the row — meaning a freshly migrated touch row appears as "this week" even if scheduled for 6 months ago. The KPI numbers are wrong. | Combine into a single `WITH ... SELECT` round-trip (Neon HTTP allows multi-statement SQL with `db.execute(sql\`...\`)`). Fix the date column: count touches as completed when `completed = true AND completed_at >= weekAgo` (need to add `completed_at` to the touches schema; currently absent). Until then, use `outcomes_ledger.logged_at >= weekAgo` as the source-of-truth for "touches this week." | -150ms render latency on Today; corrects KPI semantics. |
| 4 | **High** | `crm/src/app/(app)/today/kpi-cards.tsx:135-141` (4× `SparkAreaChart`) | Each of the 4 KPI cards renders a full Tremor `SparkAreaChart` with the **same** `trend` data, but Tremor wraps Recharts components per instance — these don't share a single SVG tree. The Today route ends up with 4 Recharts ResponsiveContainer instances + 4 ResizeObservers. This drives `/today` first-load to **278 KB** — the heaviest route in the app. | Either (a) pass a single shared trend chart at the top, or (b) replace the 4 sparklines with a hand-rolled `<svg viewBox>` polyline (10-15 lines, ~200 bytes). The data is already 14 daily points — trivial to render manually. | `/today` first-load 278 KB → ~150 KB (-128 KB / -46%). |
| 5 | Med | `crm/src/lib/queries.ts:131-141` (`recentPulse`) | Limits to `n=10` rows but issues `leftJoin(cadences)` and `SELECT *` on the ledger row + the entire cadences row (40 cols). The pulse rail uses only `account.company` and `account.companyKey`. | Project to `{ledger: {id, outcome, channel, notes, loggedAt, company}, account: {companyKey, company}}`. Keep the join. | -2-3 KB payload per Today render, marginal but cheap. |
| 6 | Med | `crm/src/app/(app)/accounts/[id]/account-tabs.tsx:1` (`"use client"`) | `AccountTabs` is `"use client"` so it can drive Radix `<Tabs>` UI state, but it's wrapped around 7 child panels (Overview, Touches, MEDDPICC, Notes, Tasks, Buyer Cast, Activity). The decision is fine, but every prop has to be serialized into the RSC payload, **and** every child component that should be RSC is dragged across the client boundary by being a child of a client component in this render tree. Result: heavier client bundle than necessary, and the timeline / activity-feed re-render on every tab change. | Keep `account-tabs` as the only client wrapper but slot RSC children via `children` prop — pass each `<TabsContent>`'s contents as already-rendered React elements from the server. Alternative: make Tabs control state via URL search params (`?tab=touches`) so each tab is its own RSC render and you don't ship 7 tabs' worth of data on the initial render. | -3-5 KB JS bundle, eliminates wasted re-renders on tab clicks. |
| 7 | Med | `crm/src/lib/queries.ts:69-75` (`getOutcomesForAccount`) | No `LIMIT` and no time bound. For an account with 100+ outcomes over a year, you ship the entire history into `<ActivityFeed>` and `<TouchTimeline>`. For v1 row counts (0 outcomes globally per `04-database-impl.md`) this is moot, but the moment Nick has been logging for a quarter this becomes a slow account-detail load. | `LIMIT 50` + `ORDER BY logged_at DESC`. Add "load more" pagination on the timeline. | Future-proofing: keeps `/accounts/[id]` <100ms as outcomes ledger grows. |
| 8 | Med | `crm/src/lib/queries.ts:247-278` (`pipelineByStage`) | Selects **all** `meddpicc` rows then groups by stage in JS. Today the meddpicc table is empty, but at scale (say 200 deals across stages) this still ships all of them. The kanban only needs the projected fields, but it gets `SELECT stage, companyKey, company, firstMeetingDate, m_metrics, e_econ_buyer, i_pain, c_champion, next_action`. The `iPain`, `mMetrics` text columns can be 2KB+ each. | Project shorter strings (e.g., `LEFT(m_metrics, 80) AS m_metrics_preview`) for card previews; load the full text only when the detail panel opens. Group in SQL via `array_agg` keyed by `stage`. | Modest; matters once meddpicc has volume. |
| 9 | Med | `crm/src/db/schema.ts:62-109` (indexes) | Schema has `touches_company_sched_channel_uniq` (composite unique) and `touches_company_idx` — good. But there's **no index on `touches.scheduled_for` or `touches.completed`**, and `todayActions()` (`queries.ts:114`) filters by `completed = false AND scheduled_for <= today` and orders by `cadences.score`. The Neon HTTP driver will scan touches and join. With 237 touches today this is fine; at 10K+ it becomes a seq-scan. Similarly `outcomes_ledger` is missing an index on `(week_start)` and `(outcome)`. | Add: `index("touches_active_idx").on(t.completed, t.scheduledFor)` (partial: `WHERE completed = false` would be ideal — Drizzle supports `.where()` in index definitions). Add `index("ol_week_outcome_idx").on(t.weekStart, t.outcome)`. | Future-proofing: keeps Today <50ms at 10× growth. |
| 10 | Med | spec (`03-architecture.md:245`) vs. `actions-panel.tsx`, `bench-table.tsx`, `pipeline-board.tsx` | Architecture spec says: *"Optimistic state = `useOptimistic()` on touch logging — the row immediately shows the outcome while the Server Action races."* No `useOptimistic` is used anywhere in the codebase (verified by `grep`). Touch logging waits for the full server round-trip + `revalidatePath` before the UI updates. The kanban move (`pipeline-board.tsx:137`) does call `revalidatePath` afterward — the user sees a flash where the card stays put until revalidation completes. | Wire `useOptimistic` on (a) `ActionsPanel`'s "Log" button — strike through row + show outcome badge immediately; (b) `PipelineBoard`'s `Select` — move card to new column immediately. Rollback on error toast. | Perceived latency drops to ~0ms (currently ~200-400ms over Neon HTTP). |
| 11 | Med | `crm/src/app/(app)/today/pulse-rail.tsx` (whole file) | Spec (`03-architecture.md:259`) says PulseRail "polls every 30s via fetch to a tiny RSC endpoint (`/api/pulse`)." The implementation is a pure RSC component that renders the props passed from `page.tsx` once and never updates. There's no `/api/pulse` route. The `Badge` saying "live" misleads. | Either remove the "live" badge and call it accurate, or add a small client component that polls via Server Action / Route Handler every 30s. For a single-user local app, the better fix is probably "don't poll; just refresh the page." | Honesty over polling; if implementing, set conservative interval. |
| 12 | Med | `crm/package.json:45` (`framer-motion`) | `framer-motion` is installed (3.8 MB on disk) but `grep` finds zero imports anywhere in `src/`. Dead dep. | `npm uninstall framer-motion`. | -3.8 MB node_modules, marginal effect on bundle (tree-shaken out). Hygiene. |
| 13 | Low | `crm/src/app/(app)/today/page.tsx:14-15`, similar `force-dynamic` everywhere | Every page sets `export const dynamic = "force-dynamic"; export const revalidate = 0;`. Correct for data pages, but `/login` (`crm/src/app/login/page.tsx:6`) is also `force-dynamic` even though it has no per-request data beyond an auth check that could happen at the layout edge. | Drop `force-dynamic` from `/login`; if Next.js insists on dynamic because of `isAuthenticated()`, move the auth check into the middleware (already does this) and let `/login` be static. | Tiny TTFB win on cold cache. |
| 14 | Low | `crm/src/app/(app)/layout.tsx:20-31` | The `(app)` layout fetches **top-200 accounts** from `cadences` on **every** route render, just to feed `<CommandPalette>`'s static index. Every page navigation re-queries this. | Move to a cached Server Action: `unstable_cache(() => listTopAccounts(200), ["palette-accounts"], { revalidate: 300 })`. Or: lazy-load the palette index (don't fetch on layout — fetch when the user opens ⌘K). | -1 query per page navigation (~20-40ms each). |
| 15 | Low | `crm/src/app/(app)/bench/bench-table.tsx:23-31` | Client-side filter recomputes `filtered` on every keystroke against 2,000 rows. No `useDeferredValue` or debounce. For 2K rows it's fine on a fast machine but contributes to keypress lag on cheap hardware. | Wrap the filter in `useDeferredValue(q)` so React can interrupt; OR debounce 100ms like accounts-table does (`accounts-table.tsx:50-53`). | -keypress lag on slower machines. |
| 16 | Low | `crm/src/lib/utils.ts:1-7` + `package.json:43` | `date-fns@4.1.0` imported piecemeal (`import { format, parseISO, ... } from "date-fns"`) — this is correctly tree-shaken in v4 via ESM. However the package weighs 38 MB on disk; the actual bundle impact is small because of tree-shaking. Verify by checking First Load JS — confirmed at 100 KB shared, which is reasonable. | No action required; flagged so a future reviewer doesn't get scared by the 38 MB on disk. | None. |
| 17 | Low | `crm/src/lib/queries.ts:114-129` (`todayActions`) | Uses `format(new Date(), "yyyy-MM-dd")` inside the query function — fine for `force-dynamic`, but means the function can never be wrapped in `unstable_cache` keyed by something stable. | Accept `today` as a parameter; let callers compute it. Doesn't matter for v1 but unlocks caching later. | None now; flexibility later. |
| 18 | Low | `crm/src/middleware.ts:1-22` | Middleware does only a cookie check + redirect — perfect for the edge. No DB query, no parsing. Good. | No change. (Mentioned to confirm: this dimension passes.) | None — already optimal. |

---

## Bundle size table (from `next build` at HEAD)

| Route | Page chunk | First-load JS | Notes |
|---|--:|--:|---|
| `/` | 140 B | 100 kB | Redirect-only. Minimal. Good. |
| `/_not-found` | 140 B | 100 kB | Static, good. |
| `/login` | 4.11 kB | 119 kB | Acceptable. Mostly the Server Action wiring. |
| `/today` | 5.32 kB | **278 kB** | **Heaviest route.** Tremor `SparkAreaChart` × 4 = ~140 KB of recharts/d3-shape pulled in. See finding #4. |
| `/accounts` | 10.5 kB | 153 kB | Reasonable. Tanstack Table + HoverCard. |
| `/accounts/[id]` | 13.5 kB | 177 kB | Acceptable for 7 client tabs + Radix tabs. Could drop ~5 KB via finding #6. |
| `/bench` | 9.25 kB | 143 kB | Tanstack Virtual is doing its job — virtualized correctly. |
| `/dashboard` | 19 kB | 234 kB | Tremor `AreaChart` + `BarChart` + `DonutChart` + `Legend` — 4 separate Recharts entry points. This is *expected* for a chart-heavy page; minor optimizations possible (replace `Legend` with a hand-rolled list since it's just `mix.map`). |
| `/pipeline` | 3.32 kB | 167 kB | Reasonable. Card UI + `Select` dropdowns per card adds up. |
| `/settings` | 7.56 kB | 122 kB | Mostly Switch + Form primitives. Fine. |
| **Middleware** | — | 32 kB | Auth check only. Good. |
| **Shared** | — | 100 kB | React 19 RC + next/router + Radix primitives. Normal for App Router. |

**Observations on the bundle:**
- Tremor is **not** namespace-imported (`import * as Tremor`); imports are correctly named (`import { AreaChart, SparkAreaChart, Legend } from "@tremor/react"`). Tree-shaking is working as well as Tremor's package boundaries allow.
- Lucide is correctly named-imported throughout (e.g., `import { Phone, Mail } from "lucide-react"`). Verified zero `import * as` against `lucide-react`.
- Recharts: pulled transitively via Tremor only. There's no direct Recharts import in `src/`. Acceptable.
- `framer-motion` is installed but unimported — node_modules-only dead weight (not in bundle).

---

## Top 3 wins (if implementing)

### Win #1 — Cut `/today` first-load from 278 KB to ~150 KB (Impact: High, Effort: ~1 hour)
Replace the four Tremor `SparkAreaChart` instances in `kpi-cards.tsx` with a small hand-rolled SVG polyline component. 14 daily points → trivial; you save ~128 KB of first-load JS and 4 ResizeObservers on the heaviest route in the app, which is also the page Nick will load 10× per day.

### Win #2 — Fix `kpiSnapshot` correctness + collapse 5 round-trips to 1 (Impact: High, Effort: ~2 hours)
The current Today KPI numbers are wrong because they filter by `last_synced` (when Python touched the row) instead of `completed_at` / `logged_at`. This single change converts a misleading dashboard into an accurate one. Bundling the 5 SQL statements into one `db.execute(sql\`WITH ... SELECT ...\`)` call shaves another ~150ms of cold-cache load over Neon HTTP. The schema needs `touches.completed_at TIMESTAMPTZ` added (currently absent — Server Action sets `completed = true` but no completion timestamp survives).

### Win #3 — Right-size Bench + Accounts payloads (Impact: High, Effort: ~3 hours)
Bench ships 2,000 full-column rows to the client; Accounts ships 1,000 and then silently truncates to 500 client-side. Project only the 8 columns the row renders, push search into the SQL query (`listAccounts` already accepts it), drop the limits to ~250-500 server-side, and add a "Load more" Server Action for pagination. This cuts initial network payload by ~1 MB on Bench and ~400 KB on Accounts. As a side benefit it eliminates the silent truncation bug on the accounts page (anything past row 500 is invisible today).

---

## Notes on dimensions that passed

- **N+1 detection** — `todayActions()` uses a proper `innerJoin(cadences)` once. `recentPulse()` uses `leftJoin(cadences)` once. No N+1 detected in any RSC. Account detail uses `Promise.all` for the 6 parallel fetches (`accounts/[id]/page.tsx:25-33`) — exactly as the architecture spec required.
- **RSC default** — verified: every page-level component (`today/page.tsx`, `accounts/page.tsx`, `accounts/[id]/page.tsx`, `pipeline/page.tsx`, `bench/page.tsx`, `dashboard/page.tsx`, `settings/page.tsx`, `login/page.tsx`) is a server component. Only the right-sized client components are `"use client"`.
- **No `useEffect(fetch)` anti-patterns** — `grep` returned nothing. All data flows through Server Actions / RSC.
- **Server Actions** — correctly Node.js runtime (not edge). The Neon HTTP driver, Drizzle, and bcrypt-style auth would all break on edge anyway.
- **revalidatePath** — used correctly after every mutation: `logOutcome` revalidates 4 paths (`/today`, `/accounts`, `/accounts/${id}`, `/dashboard`); `addNote` / `addTask` / `updateMeddpicc` / `disqualifyAccount` / `promoteToActive` each revalidate the paths they affect. Not over-revalidating.
- **Middleware** — pure cookie check, no DB queries, no parsing. Edge-safe.
- **CSP / hydration** — `suppressHydrationWarning` on `<html>` for next-themes is the correct pattern; the rest of the tree is hydration-safe.

---

## Files referenced

- `/Users/ricknini/Documents/ADP PEO/crm/src/lib/queries.ts`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/actions/index.ts`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/today/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/today/kpi-cards.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/today/pulse-rail.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/today/actions-panel.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/accounts/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/accounts/accounts-table.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/accounts/[id]/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/accounts/[id]/account-tabs.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/bench/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/bench/bench-table.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/dashboard/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/dashboard/dashboard-charts.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/pipeline/page.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/pipeline/pipeline-board.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/app/(app)/layout.tsx`
- `/Users/ricknini/Documents/ADP PEO/crm/src/middleware.ts`
- `/Users/ricknini/Documents/ADP PEO/crm/src/db/schema.ts`
- `/Users/ricknini/Documents/ADP PEO/crm/src/lib/auth.ts`
- `/Users/ricknini/Documents/ADP PEO/crm/package.json`
- `/Users/ricknini/Documents/ADP PEO/crm/next.config.mjs`
