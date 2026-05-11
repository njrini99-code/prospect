# ADP PEO — Eastern NC OS

A production-grade, keyboard-first CRM for a solo ADP TotalSource (PEO/HRO) sales rep working eastern North Carolina. Built to replace the Excel + Google Sheets workflow with something that feels like Linear meets Attio meets Pipedrive.

**Goal:** close one deal in 30 days.

## Stack

- **Next.js 15** App Router · Server Components · Server Actions
- **TypeScript** strict mode
- **Tailwind CSS** + **shadcn/ui** components
- **Tremor** for charts + KPI sparklines
- **Drizzle ORM** + **Neon Postgres** (`@neondatabase/serverless`)
- **cmdk** for the global command palette (⌘K)
- **next-themes** for dark/light toggle (default dark)
- **Sonner** for toasts
- **Framer Motion** for animations
- **nuqs** for URL-state-backed filters
- **Vitest** unit tests · **Playwright** E2E

## Run

```bash
cd /Users/ricknini/Documents/ADP\ PEO/crm
npm install
npm run dev
```

Open http://localhost:3000 and sign in.

## Env vars

Copy `.env.local.example` to `.env.local` and fill in:

| Var | Required | Description |
|---|---|---|
| `DATABASE_URL` | yes | Neon Postgres connection string (pre-populated from parent workspace) |
| `APP_PASSWORD` | yes | Single-user password for sign-in |
| `MAPBOX_TOKEN` | no | Enables the Tue/Wed/Thu route map |

## Pages

| Route | What it does |
|---|---|
| `/login` | Single-user password sign-in |
| `/today` | KPI hero · time blocks · today's actions · pulse rail |
| `/accounts` | Searchable/filterable table with saved views and hover-card preview |
| `/accounts/[id]` | Single-account deep-dive: overview / touches / MEDDPICC / notes / tasks / buyer cast / activity |
| `/pipeline` | Kanban by MEDDPICC stage with inline stage moves |
| `/bench` | Virtualized table of bench accounts · promote to Mon batch |
| `/dashboard` | Charts, conversion-by-trigger, portfolio mix, learned-weights coaching |
| `/settings` | Cadence config · weights · theme · integrations · export |

## Daily workflow

1. **Morning** — open `/today`. Hero KPIs, time blocks, warm follow-ups, verified emails, cold queue.
2. **Power hour** — 11:30–12:30. Work the "Cold power hour" section. Press `E` on any focused row to log the outcome.
3. **Field days** (Tue/Wed/Thu) — print `/today` before you leave; route is in the Field route block.
4. **Wrap** — 16:00–17:00. Use `⌘K` to find accounts, add notes, advance MEDDPICC stages.
5. **Weekly** — Friday: review `/dashboard`, lean into the learned weights, plan Monday's batch from `/bench`.

## Keyboard

- `⌘ K` global command palette
- `?` keyboard shortcut help
- `G T` Today · `G A` Accounts · `G P` Pipeline · `G B` Bench · `G D` Dashboard · `G S` Settings
- `J / K` navigate list rows
- `E` log outcome on focused row
- `Esc` close any modal

## Tests

```bash
npm test            # vitest unit tests
npm run test:e2e    # Playwright e2e (requires the dev server)
npm run typecheck   # strict-mode tsc --noEmit
```

## Database

Schema is in `src/db/schema.ts` and mirrors the Python migration script at
`/Users/ricknini/Documents/ADP PEO/scripts/sync_to_neon.py`. Read-only at the
Drizzle layer except for the additive CRM tables (`crm_notes`, `crm_tasks`,
`weekly_metrics`). To push the additive tables (notes/tasks) to Neon:

```bash
npm run db:push
```

## Deploy to Vercel later

```bash
vercel link
vercel env add DATABASE_URL production
vercel env add APP_PASSWORD production
vercel deploy --prod
```

## Style references

- [Linear](https://linear.app) — dense, keyboard, dark
- [Attio](https://attio.com) — table-heavy CRM
- [Pipedrive](https://pipedrive.com) — kanban pipeline
- [Tremor](https://tremor.so) — dashboards

---

Built with restraint. Information density > whitespace. Subtle motion.
