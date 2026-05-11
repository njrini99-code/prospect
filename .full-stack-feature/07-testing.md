# Testing & Validation: ADP PEO Sales OS CRM

> Consolidates Step 7's three parallel reviews. **Auto-mode action: a fix agent is being dispatched to address all Critical + High items below before Checkpoint 2.**

## Test Suite (from `07a-test-report.md`)

- **172 Vitest tests passing** (up from 36) — wall-clock 1.75s
- **`npm run build` clean** — no regressions
- 7 test files cover Server Actions, score overlay (49 tests on boundary values), cadence schedule (32 tests on route-day mapping + date arithmetic), auth round-trips, and the existing query/lib utilities
- 2 new Playwright e2e specs scaffolded: `pipeline-stage-move.spec.ts`, `bench-promote.spec.ts`

## Security Findings (from `07b-security-audit.md`)

Calibrated for local-only single-user. Same code on a public URL = 2–3 tiers higher.

| # | Severity | File:line | Finding |
|---|---|---|---|
| 1 | **🔴 CRITICAL** | `crm/src/lib/auth.ts:14-20` | Session "token" is `base64(APP_PASSWORD)` — reversible obfuscation. Spec called for bcrypt + random session IDs in in-memory Set; **neither was built.** |
| 2 | **🔴 CRITICAL** | `crm/.env.local:1-2` | Live Neon URL + production `APP_PASSWORD=adppeo2026` (10 chars, project-name+year) sitting in plaintext. **Neon credential must be rotated** — it's already passed through this audit's transcript. |
| 3 | 🟠 HIGH | `crm/src/app/actions/index.ts` | **Zero Server Actions call `requireAuth()`.** Only middleware + Next.js's built-in CSRF check guard mutations. |
| 4 | 🟠 HIGH | `crm/src/lib/auth.ts:25` | Password compare uses `!==`, not `crypto.timingSafeEqual` (timing attack). |
| 5 | 🟠 HIGH | `package.json` | `next@15.0.3` has **15 published advisories** including Critical RCE (GHSA-9qr9-h5gf-34mp) + Middleware Auth Bypass (GHSA-f82v-jwr5-mffw) that turns finding #3 into a real exploit chain. |
| 6 | 🟠 HIGH | `package.json` | `drizzle-orm@0.36.4` SQL identifier escaping CVE (GHSA-gpj5-g38j-94v9). Not currently reachable from this code, but the dep needs upgrading. |
| 7 | 🟡 MED | middleware/code drift | `/api/health` allowlisted in middleware but no `route.ts` exists. |
| 8–11 | 🟡 MED | various | HTTP security headers missing (CSP, X-Frame-Options); no session invalidation on logout; sessionId not regenerated on login; `next dev` defaults to `0.0.0.0`. |
| 12–13 | 🟢 LOW | various | dev-only minor issues. |
| 14–15 | INFO | — | misc. |

### Pleasant surprises (the agent flagged these as defense-in-depth wins)
- ✅ No `fetch`/`axios` anywhere in `src/` → SSRF structurally impossible
- ✅ No raw-HTML insertion APIs anywhere → XSS surface minimal
- ✅ Notes rendered as plain text `{n.body}` — safer than the spec's documented markdown approach
- ✅ All Drizzle queries parameterized — no SQL injection vectors
- ✅ `.gitignore` correctly excludes `.env*.local`

### Ship-go recommendation (from auditor)
**Conditional ship-go for `localhost:3000` single-user-only.** Acceptable if AND ONLY IF:
- Dev server bound to `127.0.0.1` (not the default `0.0.0.0`)
- `.env.local` confirmed gitignored (`git check-ignore .env.local`)
- No `vercel deploy` until findings 1, 2, 3, 5, 6 remediated
- No `next start` exposed to LAN

## Performance Findings (from `07c-performance-review.md`)

| # | Impact | File:line | Finding |
|---|---|---|---|
| P1 | **🔴 CORRECTNESS** | `crm/src/lib/queries.ts:143-194` | `kpiSnapshot` filters on `last_synced` instead of completion/logged_at → **Today's KPI numbers are semantically wrong**. Also 5 sequential Neon round-trips that could be 1 CTE. |
| P2 | 🟠 HIGH | `crm/src/app/(app)/today/*` | First-load JS **278 KB** driven by 4× Tremor `SparkAreaChart`. Replace with hand-rolled SVG polylines → saves ~128 KB. |
| P3 | 🟠 HIGH | `crm/src/app/(app)/bench/*` | Ships **2,000 full rows** to client. Should server-paginate + project only displayed columns. |
| P4 | 🟠 HIGH | `crm/src/app/(app)/accounts/*` | Ships 1,000 rows; truncates client-side to 500. Same fix as P3. |
| P5 | 🟠 HIGH | `crm/src/components/touch-logger.tsx` | `useOptimistic` not wired — touch logging waits for server round-trip. Spec said optimistic. |
| P6–P13 | 🟡 MED | various | `framer-motion` installed but never imported (dead dep), Pulse rail "live" badge misleading (no polling wired), missing indexes on `touches.scheduled_for/completed` + `outcomes_ledger.week_start/outcome` (fine at 237 rows, hot at 10K+). |
| P14–P19 | 🟢 LOW | — | minor optimizations |

### Performance wins (correctly implemented)
- ✅ No N+1 detected
- ✅ No `useEffect(fetch)` anti-patterns
- ✅ RSC-by-default enforced
- ✅ `Promise.all` parallel fetches on `/accounts/[id]`
- ✅ Middleware edge-safe (cookie check only, no DB)

## Functional bugs flagged (from `07a` test agent)

Cross-listed because these blur sec/perf/correctness boundaries:

| # | File | Bug | Impact |
|---|---|---|---|
| F1 | `actions/index.ts logOutcome` | Doesn't transition `cadences.status` to `killed` on dnc/dead/not_interested, or to `nurture` on meeting_cancelled. Ledger writes; status stale. | Biggest functional gap vs. spec |
| F2 | `actions/index.ts logOutcome` | Doesn't auto-create `meddpicc` row on `meeting_booked` | `/pipeline` stays empty even after logging meetings |
| F3 | `actions/index.ts promoteToActive` | Hard-codes `routeDay=0` for every promoted account regardless of county | Cumberland account first drop scheduled for Monday Wake route |
| F4 | `actions/index.ts moveMeddpiccStage` | No server-side stage transition guard. Accepts backwards moves (`Closed-Won` → `Discovery scheduled`). | Data integrity |
| F5 | `lib/auth.ts` | No rate limiter despite spec | Brute-force exposure |

## Action items (auto-mode dispatch)

Per orchestrator rule "If there are Critical or High severity findings from security or performance review, address them now before proceeding" — a fix agent is being dispatched with the following brief:

**MUST-FIX (Critical + High that affect correctness or security):**
1. **Auth rewrite** — bcrypt + cost 10 + `crypto.timingSafeEqual` + 32-byte random session IDs in in-memory Set + 5-attempt rate limiter per IP per 5 minutes
2. **`requireAuth()` on every Server Action** — defense in depth on top of middleware
3. **Next.js upgrade** to latest 15.x patch (or 16.x if released) — closes RCE + middleware bypass advisories
4. **drizzle-orm upgrade** to latest patch — closes SQL identifier escape CVE
5. **`kpiSnapshot` correctness** — fix the date column (use `touches.completed_at` or `outcomes_ledger.logged_at`) + collapse 5 round-trips into one CTE
6. **`logOutcome` status transitions** — kill outcomes → `cadences.status='killed'`; nurture outcomes → `cadences.status='nurture' + nurture_until=now+90d`
7. **`logOutcome` meddpicc auto-create** — `meeting_booked` outcome upserts a `meddpicc` row with stage `discovery_scheduled`
8. **`promoteToActive` routeDay** — honor the input parameter (don't hardcode 0)
9. **`moveMeddpiccStage` stage guard** — server-side enum + valid-transition matrix
10. **`/api/health` route** — add the missing `route.ts` referenced in middleware
11. **Pulse rail polling** — wire actual polling or remove the "live" badge

**MUST-DO (user action):**
- 🔁 **Rotate the Neon database password** via Neon console. Current cred (`npg_Ud7s1GKtLBlC...`) has been in audit transcripts.
- 🔁 **Change `APP_PASSWORD`** in `.env.local` from `adppeo2026` to something stronger (12+ chars, mixed case + digit + symbol).
- ✅ Bind `next dev` to `127.0.0.1` (`PORT=3000 HOSTNAME=127.0.0.1 npm run dev`).

**SHOULD-FIX (high perf wins, not correctness):**
- 12. Replace 4× Tremor sparklines on `/today` with hand-rolled SVG polylines (~128 KB JS saved)
- 13. Wire `useOptimistic` on touch logging
- 14. Server-paginate `/bench` and `/accounts` to ≤50 rows per page
- 15. Remove unused `framer-motion` dep

**DEFER to v1.1 (not blocking ship):**
- Drizzle schema upgrade to expose `companies` / `contacts` / `triggers` / `carriers` / `incumbent_peo` (the 12-table master schema)
- Density toggle, bulk actions, mapbox route
- HTTP security headers (CSP, X-Frame-Options) — needed before any non-local deployment
- Missing indexes on `touches.scheduled_for/completed` + `outcomes_ledger.week_start/outcome` (premature at 237 rows; do before scaling)

## Final summary

| Tier | Count |
|---|--:|
| 🔴 Critical | **3** (sec session, env credential exposure, kpiSnapshot correctness) |
| 🟠 High | **8** (4 sec + 4 perf) |
| 🟡 Medium | **17** combined |
| 🟢 Low / Info | ~12 combined |

**Fix agent dispatched now.** Once it returns, re-run `npm test` + `npm run build` and present Checkpoint 2.

**Tests:** 172 passing pre-fix. Target post-fix: 172+ passing (don't regress).
