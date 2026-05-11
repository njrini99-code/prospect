# ADP PEO CRM — Operations Runbook

> Day-to-day ops for the local CRM + path to Vercel deploy when ready.

## Prerequisites

| Component | Version | Why |
|---|---|---|
| Node.js | **24 LTS** (current default) | matches `package.json` engines + Next.js 16 requirement |
| Python | 3.11+ | one-time data migration via `scripts/migrate_to_neon.py` |
| Neon account | free tier OK | hosts the Postgres |
| GitHub account | (optional) | for CI + future Vercel deploy |
| Vercel account | (optional, future) | only when deploying past local |

Verify before starting:
```bash
node --version    # v24.x
python3 --version # 3.11+
psql --version    # optional — Neon's web SQL editor is enough
```

## Local development

### One-time setup
```bash
git clone https://github.com/njrini99-code/prospect.git
cd prospect

# Python deps for the migration + sync scripts
python3 -m pip install --break-system-packages "psycopg[binary]" openpyxl

# CRM deps (the app)
cd crm
cp .env.local.example .env.local
# Edit .env.local — set DATABASE_URL (from Neon dashboard) + APP_PASSWORD (12+ chars)
npm install --legacy-peer-deps
```

### First-time database bootstrap (one-time, from parent dir)
```bash
cd "/Users/ricknini/Documents/ADP PEO"
python3 scripts/migrate_to_neon.py --fresh
```
This ingests ALL local data sources (pipeline.sqlite, ADP_*.xlsx, ALL_COMPETING_PEO_ACCOUNTS.csv, _sales_os_state.json) and writes 12 tables. Wall-clock: ~5 min on first run.

### Daily workflow

```bash
cd "/Users/ricknini/Documents/ADP PEO/crm"
PORT=3000 HOSTNAME=127.0.0.1 npm run dev
```

**Why `HOSTNAME=127.0.0.1`:** the Next.js dev server defaults to `0.0.0.0` which exposes the app to anyone on your LAN. Binding to localhost only blocks that.

Then open http://localhost:3000 → login with `APP_PASSWORD` from your `.env.local`.

### Sunday-night rebuild (refreshes active cadences from outcomes)

```bash
cd "/Users/ricknini/Documents/ADP PEO"
python3 scripts/build_sales_os.py    # rebuilds state from Friday's Weekly_Wrap outcomes
python3 scripts/sync_to_neon.py      # UPSERT to Neon (preserves CRM-side notes/tasks/MEDDPICC)
# (CRM auto-picks up changes on next page load — no restart needed)
```

## Database operations

### Schema migrations going forward

Use Drizzle, not the Python script (which is bootstrap-only):
```bash
cd crm
# After editing src/db/schema.ts:
npx drizzle-kit generate              # creates SQL migration file
npx drizzle-kit migrate               # applies it to Neon
```

### Backups

Neon does automatic Point-in-Time Recovery (PITR) — every commit retained for the retention window (free tier = 7 days, paid = 30+ days). To restore:
1. Neon dashboard → your project → Backups
2. Click "Restore to a new branch" at the desired timestamp
3. Update `DATABASE_URL` in `.env.local` to the new branch's connection string
4. Restart dev server

### Manual export (just in case)
```bash
# Dump everything (requires pg_dump installed locally)
pg_dump "$DATABASE_URL" > backup-$(date +%Y-%m-%d).sql
```

## Vercel deployment (when you're ready)

> ⚠️ **Pre-deploy checklist — do ALL of these first:**
> 1. Rotate the Neon password via Neon dashboard (current cred has been in transcripts)
> 2. Change `APP_PASSWORD` from `adppeo2026` to 16+ chars mixed (open `crm/.env.local`)
> 3. Verify `.env.local` is gitignored: `git check-ignore crm/.env.local` (must return the filename)
> 4. Uncomment the security headers block in `vercel.ts.example` (or add equivalent to `next.config.mjs`)
> 5. Confirm `crm/vercel.json` regions match Neon's region (`iad1` = us-east-1, matches the seeded Neon project)

### First deploy
```bash
cd "/Users/ricknini/Documents/ADP PEO/crm"
npx vercel login            # one-time, opens browser
npx vercel link             # connects this folder to a Vercel project
npx vercel env add DATABASE_URL production    # paste the ROTATED Neon URL
npx vercel env add APP_PASSWORD production    # paste the new strong password
npx vercel                  # preview deploy first — get a *.vercel.app preview URL
# Click the preview URL, log in with the new password, smoke-test
npx vercel --prod           # promote to production
```

### Subsequent deploys
```bash
# Just push to main — Vercel auto-deploys IF you've connected the GitHub repo via the dashboard
git push origin main
# OR manually:
cd crm && npx vercel --prod
```

### Rollback

**App rollback (instant):**
```bash
npx vercel rollback         # interactive — pick a previous deployment
# OR specify directly:
npx vercel rollback <previous-deployment-url>
```

**Database rollback:**
- For schema migrations: `cd crm && npx drizzle-kit drop` (interactive — pick which migration to drop)
- For data corruption: restore via Neon PITR to a fresh branch, then swap `DATABASE_URL`

## Health checks + monitoring

### Liveness probe

`GET /api/health` returns:
- `200 { ok: true, db: "connected", ts }` when the DB query (`SELECT 1`) succeeds
- `503 { ok: false, db: "unreachable" }` on DB failure

Vercel automatically pings this if configured in the project dashboard.

### Future observability (v1.1+)

Currently `console.error` only. When you outgrow that:
- **Axiom** or **Logflare** for structured logs (free tier OK at this volume)
- **Vercel Analytics** auto-enabled on deploy (page views, Core Web Vitals)
- **Sentry** for error tracking (already in Vercel marketplace integration)

## Incident response

| Symptom | First check | Likely fix |
|---|---|---|
| `/today` shows "DB unreachable" | `curl http://localhost:3000/api/health` returns 503 | Check Neon status page; verify `DATABASE_URL` in `.env.local`; restart dev server |
| Login rejects correct password | Check `APP_PASSWORD` env var is set + non-empty | Restart dev server — bcrypt hash recomputes on boot |
| `npm run build` fails | Read the build log | Run `npx tsc --noEmit` to find type errors; run `npm test` to find broken tests |
| Vercel deploy 500s | Vercel dashboard → Deployments → last deploy → Logs | Most common: missing env var. Verify `DATABASE_URL` + `APP_PASSWORD` set in Vercel dashboard |
| Cmd+K palette empty | Check Neon connection | The palette indexes top-200 companies on mount; DB issue would prevent that |

## Feature flags (future)

Not used in v1 (single-user app). When you start running experiments:
```bash
npm install @vercel/flags
```
Then read https://vercel.com/docs/workflow-collaboration/feature-flags for the pattern.

## Open items for v1.2

- Migrate `middleware.ts` → `proxy.ts` (Next 16 deprecation — cosmetic warning, not breaking)
- Replace remaining Tremor `BarChart` + `DonutChart` on `/dashboard` with SVG (same pattern as the area chart swap)
- Wire up real observability (Axiom or Sentry) before second deploy
- Add HTTP Content-Security-Policy header (currently commented in `vercel.ts.example`)
- Run `npm audit --omit=dev` monthly and patch any high+ severity findings

## Useful one-liners

```bash
# Reset entire local DB (CAREFUL — wipes everything)
cd "/Users/ricknini/Documents/ADP PEO"
python3 scripts/migrate_to_neon.py --fresh

# Rebuild active cadences from outcomes
python3 scripts/build_sales_os.py

# Push state snapshot to Neon (keeps Excel + CRM in sync)
python3 scripts/sync_to_neon.py

# Run only the tests
cd crm && npm test -- --run

# Run only typecheck
cd crm && npx tsc --noEmit

# See what's in your bench right now
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM companies WHERE NOT disqualified AND status IN ('bench','nurture');"

# See today's actions
psql "$DATABASE_URL" -c "SELECT * FROM v_today_actions LIMIT 20;"

# Check health
curl http://localhost:3000/api/health
```
