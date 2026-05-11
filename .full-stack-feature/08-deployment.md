# Deployment & Operations: ADP PEO Sales OS CRM

**Status:** ✅ Complete. Local-first config + Vercel-when-ready path documented. CI pipeline runs verify-only (no auto-deploy).

> **Note:** The originally dispatched `deployment-engineer` agent crashed with "Prompt is too long". I wrote the deliverables directly — they're configuration, not code, and the spec was already in `03-architecture.md`.

## Files written

| File | Purpose |
|---|---|
| `crm/.github/workflows/ci.yml` | CI pipeline: typecheck + 242-test gate + Next 16 build, runs on push + PR |
| `crm/vercel.json` | Minimal Vercel project config (framework=nextjs, region=iad1, npm install --legacy-peer-deps) |
| `crm/vercel.ts.example` | Modern TS-typed Vercel config showing how to migrate when ready (includes security headers + cron-skeleton + CSP block ready to uncomment) |
| `crm/RUNBOOK.md` | Full operations runbook (prereqs, local setup, daily workflow, Sunday rebuild, schema migrations, Vercel deploy, rollback, incident response) |

## CI pipeline (`crm/.github/workflows/ci.yml`)

**Triggers:** push to main + pull_request to main
**Runtime:** ubuntu-latest, Node 24 LTS
**Timeout:** 15 min

**Steps:**
1. Checkout
2. Setup Node + cache npm + cache `.next/cache`
3. `npm ci --legacy-peer-deps` (Tremor v3 peer pin)
4. `npx tsc --noEmit` — strict TS gate
5. `npm test -- --run` — Vitest 242+ tests, must not regress
6. `npm run build` — Next 16 build with placeholder env vars
7. Verify `.next/server` and `.next/BUILD_ID` exist + report build size

**Deliberately NOT in CI:** any `vercel deploy` step. Nick controls deploys manually from his laptop per `RUNBOOK.md`.

## Vercel deployment path (when Nick is ready)

### Pre-deploy checklist (must do ALL):
1. 🔁 Rotate Neon password (current cred has been in audit transcripts)
2. 🔁 Change `APP_PASSWORD` from `adppeo2026` to 16+ chars mixed
3. ✅ Verify `.env.local` is gitignored: `git check-ignore crm/.env.local`
4. ✅ Uncomment the security headers block in `vercel.ts.example` (or migrate to vercel.ts and add)
5. ✅ Confirm `crm/vercel.json` `regions: ["iad1"]` matches Neon's project region

### Deploy procedure (from runbook):
```bash
cd "/Users/ricknini/Documents/ADP PEO/crm"
npx vercel login                                  # one-time
npx vercel link                                   # connects folder to Vercel project
npx vercel env add DATABASE_URL production        # rotated Neon URL
npx vercel env add APP_PASSWORD production        # new strong password
npx vercel                                        # preview deploy → test the *.vercel.app URL
npx vercel --prod                                 # promote to production
```

## Database migration order

| Stage | Tool | When |
|---|---|---|
| First-time bootstrap | `python3 scripts/migrate_to_neon.py --fresh` | One-time only, from parent workspace |
| Subsequent schema changes | `npx drizzle-kit generate` + `npx drizzle-kit migrate` | Whenever `crm/src/db/schema.ts` changes |
| Data refresh (every Sunday) | `python3 scripts/build_sales_os.py` + `python3 scripts/sync_to_neon.py` | Sunday-night rebuild from Friday's outcomes |

**Important:** Vercel build does NOT need DB access. Migrations run from Nick's laptop, not from Vercel CI.

## Health checks + monitoring

### Liveness probe
- **Endpoint:** `GET /api/health` (already implemented in Step 7 fix)
- **Returns:** `200 { ok: true, db: "connected", ts }` on `SELECT 1` success
- **On DB error:** `503 { ok: false, db: "unreachable" }`
- **Auth:** not required (allowlisted in middleware)

### Vercel-native observability (when deployed)
- Vercel Analytics: auto-enabled (page views, Core Web Vitals)
- Vercel Functions logs: structured by default
- Vercel Speed Insights: opt-in via dashboard

### Future structured logging (v1.2+)
Currently `console.error` only. Options when scale demands it:
- **Axiom** — free tier handles this volume; pair with `@axiomhq/js`
- **Logflare** — same tier
- **Sentry** — error tracking (Vercel marketplace integration is one-click)

Not wired now to keep the v1 dependency surface lean.

## Rollback procedures

### App rollback (instant)
```bash
npx vercel rollback                              # interactive picker
# OR direct:
npx vercel rollback <previous-deployment-url>
```

### Database rollback
- **Schema migration revert:** `cd crm && npx drizzle-kit drop` (interactive — pick migration)
- **Data corruption / accidental wipe:** Neon Point-in-Time Recovery (PITR)
  - Free tier: 7-day retention
  - Paid tier: 30+ days
  - Dashboard → Backups → Restore to new branch at desired timestamp → swap `DATABASE_URL` to the new branch

## Incident response (excerpt from RUNBOOK)

| Symptom | First check | Likely fix |
|---|---|---|
| `/today` shows "DB unreachable" | `curl http://localhost:3000/api/health` → 503 | Neon status page; verify `DATABASE_URL` |
| Login rejects correct password | `APP_PASSWORD` env var present + non-empty | Restart dev server (bcrypt hash recomputes on boot) |
| `npm run build` fails | Read build log | Run `npx tsc --noEmit` + `npm test` to localize |
| Vercel deploy 500s | Dashboard → Logs | Most common: env var missing |
| Cmd+K palette empty | Health probe + Neon connection | DB issue prevents top-200 index load |

## Feature flags

Not used in v1. When Nick starts running experiments:
- Install `@vercel/flags`
- Pattern: https://vercel.com/docs/workflow-collaboration/feature-flags

## Open items / future-work hooks

| Item | Severity | Action |
|---|---|---|
| Rotate Neon password before any deploy | 🔴 Required | Nick — Neon dashboard |
| Change default `APP_PASSWORD` | 🔴 Required | Nick — edit `.env.local` |
| `middleware.ts` → `proxy.ts` rename | 🟡 Cosmetic | v1.2 — Next 16 deprecation warning only |
| Remaining Tremor `BarChart` + `DonutChart` on `/dashboard` | 🟢 Perf | v1.2 — same SVG swap as area chart |
| Wire CSP header (commented in `vercel.ts.example`) | 🟡 Hardening | Before first production deploy |
| Structured logging (Axiom/Sentry) | 🟢 Future | When error volume justifies |
| Auto-deploy on push to main | 🟢 Optional | Connect Vercel project to GitHub repo in dashboard |

## Decision log

1. **CI is verify-only.** Deploys stay manual via `vercel` CLI for v1 — Nick wants explicit control before anything goes live. Wired auto-deploy on push is documented as v1.2 option.
2. **Region `iad1` (us-east-1).** Matches Neon project region. Co-located = lowest latency for Server Actions hitting the DB.
3. **Bootstrap stays Python.** The 12-table master schema is created by `scripts/migrate_to_neon.py`, not Drizzle migrations. Drizzle takes over for incremental schema changes going forward. Two reasons: (a) the Python script does ETL across 5 local sources, not just DDL; (b) it has the ICP/dedupe logic that mirrors `build_sales_os.py`.
4. **No HTTP CSP header in v1.** Browser console will complain without it but the app works. Wiring CSP requires testing every Tremor / shadcn / Lucide path; pushed to "before first prod deploy" gate.
5. **`vercel.json` over `vercel.ts` for v1.** Avoids adding `@vercel/config` dep just to ship local. `vercel.ts.example` is included as the modern upgrade path.

## Next step

Step 9 — final documentation + handoff (ADRs, API reference, schema notes, README polish).
