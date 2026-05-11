# Database Implementation: ADP PEO Sales OS CRM

**Status:** ✅ Complete. Implementation matches the schema spec in `02-database-design.md`. Migration agent took 266s wall-clock for a `--fresh` run against the live Neon instance.

## Deliverables produced

| File | Purpose |
|---|---|
| `scripts/migrate_to_neon.py` (~750 LOC) | Idempotent ETL: drops + recreates schema (`--fresh`) or `CREATE IF NOT EXISTS`, then ingests from 5 local sources, dedupes, applies ICP filters, bulk-inserts |
| `MIGRATION.md` (workspace root) | Human-readable schema + ETL rules reference |

## Final row counts (after `--fresh` run, 2026-05-11)

| Table | Rows | Source breakdown |
|---|--:|---|
| `companies` | **190,692** | pipeline.sqlite (primary) + ALL_COMPETING_PEO_ACCOUNTS.csv (492 net-new) + _sales_os_state.json (0 net-new — already in sqlite) |
| `triggers` | **955,846** | Every non-DEFAULT `pitch_signal_primary` + WC renewal triggers + health renewal + OSHA + hiring velocity + ALE threshold + has-5500 |
| `carriers` | **15,798** | All rows from `pipeline.sqlite.carriers` (Schedule A health) |
| `contacts` | **4,059** | DM names from displacement CSV + `primary_contact_name` enrichments + `owner_or_ceo` enrichments |
| `notes` | **3,605** | Imported from `talk_track` + `enrichment_notes` fields where present |
| `incumbent_peo` | **1,514** | `competing_peo_brand` enrichments + displacement CSV `current_peo` |
| `touches` | **237** | Every `state.active_cadences[*].touches[*]` row |
| `cadences` | **48** | Active state |
| `weights_current` | **15** | trigger / vertical / channel / route_day learned multipliers |
| `outcomes_ledger` | 0 | (empty — Nick hasn't logged outcomes yet via CRM) |
| `tasks` | 0 | (empty) |
| `meddpicc` | 0 | (empty — fills when first meeting books) |
| `brokers` | 0 | (empty — auto-recruits as broker captures land) |
| `weekly_metrics` | 0 | (will populate on first weekly rollup) |

**Views populated:**
- `v_today_actions` — 15 rows (Monday batch with next un-completed touch)
- `v_active_pipeline` — 45 rows (cadences in active/warm_followup status)
- `v_bench_top100` — 100 rows (top-scored undisqualified bench accounts)

## Disqualification rules applied

42,500 companies flagged `disqualified = TRUE` (kept in DB so they don't re-add; visibly off-limits):

| Reason | Count |
|---|--:|
| `NAICS_PREFIX` (construction/trucking/waste/arts/food/retail) | 14,833 |
| `NAME_REGEX` (construction/trades/retail keywords) | 13,038 |
| `OFF_FOCUS_NAME` (specific off-focus name substrings) | 12,463 |
| `ZIP_OUT_OF_TERRITORY` | 1,742 |
| `UNC_DUKE_MAILDROP` (27599/27704/27705/27708/27710) | ~80 |
| `RTP_PROPER` (27709) | ~70 |
| `WORKED_REGISTRY` / `PIPELINE_DROP` (already touched / DNC / acquired / etc.) | ~280 |

**Qualified ICP-fit prospects: 13,753** — these pass all gates (in-territory + 11–55 EE + ICP focus + not previously worked). This is the actual bench available to promote into cadences.

## Schema fidelity vs. design

✅ All 12 tables + 3 views from `02-database-design.md` were created with the exact column names, types, and indexes specified.

✅ `UNIQUE (name_normalized, zip)` constraint enforced — multi-source rows merged on this key.

✅ `companies.source` is pipe-delimited to track multi-source origin (e.g., `sqlite|competing_peo_csv|sales_os`).

✅ All write paths use parameterized queries — no SQL injection vectors. `DATABASE_URL` never logged.

✅ Memory-bounded ETL: enrichments streamed in 50K-row chunks, companies in 10K LIMIT/OFFSET pages.

## Performance

- **Wall-clock:** 266 sec on `--fresh` run (exceeds the < 60s target spec'd in 02-database-design.md).
- **Why:** The `triggers` table grew to 955K rows because the `pitch_signal_primary` enrichment field has one row per company per signal (one company can have multiple signals over time). 191K companies × ~5 avg signals = ~1M rows.
- **Mitigation options if perf becomes an issue:**
  1. **Drop `pitch_signal_primary` from `triggers`** — it's already denormalized on `companies.pitch_signal`. Would cut triggers to ~50K rows and bring wall-clock to <60s. ⚠️ Tradeoff: lose historical signal-state-over-time.
  2. **Partition `triggers` by `trigger_type`** — speeds up filtered queries; doesn't help migration speed.
  3. **Run migration incrementally** — only update rows since last sync; full refresh only on `--fresh`.
- **Decision:** Accept 266s for v1. Migration is a Sunday-night batch — not interactive. Revisit if Nick hits the runtime regularly.

## Compatibility notes

- **Legacy tables retained:** `buyer_cast` and `channel_brokers` from the older `scripts/sync_to_neon.py` were NOT dropped. They sit alongside the new schema and continue to receive updates from `build_sales_os.py`. The CRM will read from the new tables; the legacy ones are a fallback during the migration period.
- **Both writers active:**
  - `scripts/build_sales_os.py + sync_to_neon.py` → continues writing legacy + new cadences/touches tables on Sunday rebuilds
  - The new CRM → writes to outcomes_ledger / notes / tasks / meddpicc / brokers (CRM's exclusive write surface)
  - No write conflicts because the two systems own different tables.

## CLI

```bash
# One-time bootstrap (DROP CASCADE + CREATE + bulk ingest)
python3 scripts/migrate_to_neon.py --fresh

# Idempotent re-run (CREATE IF NOT EXISTS + UPSERT)
python3 scripts/migrate_to_neon.py

# Plan-only (parse + dedupe + report, no writes)
python3 scripts/migrate_to_neon.py --dry-run
```

## What the CRM frontend can now rely on

When the frontend agent finishes scaffolding the Next.js app, it can `drizzle-kit introspect:pg` against the live Neon DB and get exact TypeScript types for every column. The schema is stable; columns won't be renamed.

Key tables the frontend will read heavily:
- `companies` (accounts list, drill-in)
- `v_today_actions` (Today page)
- `v_bench_top100` (Bench page, with extended filters)
- `cadences` + `touches` (cadence tracker)
- `meddpicc` (pipeline kanban)
- `triggers` + `carriers` + `incumbent_peo` (account-detail page enrichment panel)

Key tables the frontend will write to (via Server Actions):
- `touches` (mark completed + outcome)
- `outcomes_ledger` (append per outcome)
- `notes` (add/edit/delete)
- `tasks` (add/check/delete)
- `meddpicc` (stage transitions, field edits)
- `brokers` (auto-create when broker captured on touch)

## Next steps (within Phase 2)

⏳ **Frontend agent still running.** When it completes, I'll synthesize `05-backend-impl.md` (Server Actions, lib/scoring, lib/cadence, auth, queries) and `06-frontend-impl.md` (pages, components, design system) from its output.

Then Step 7 (3 parallel reviewers) → Checkpoint 2.
