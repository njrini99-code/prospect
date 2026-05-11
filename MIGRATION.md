# MIGRATION.md — ADP PEO → Neon Postgres

Single-shot ETL from the rep's local data files into a clean Postgres schema on
Neon, driven by `scripts/migrate_to_neon.py`.

## Run

```bash
# full migration (idempotent; truncates companies + cascade, recreates schema)
python3 scripts/migrate_to_neon.py

# wipe the migration-owned tables + recreate from scratch
python3 scripts/migrate_to_neon.py --fresh

# parse + dedupe, but write nothing
python3 scripts/migrate_to_neon.py --dry-run
```

The connection string is read from `.env` (`DATABASE_URL=…`) — the script never
echoes the value.

## Source files (read locally, no SaaS / CRM calls)

| Source | Rows in | Purpose |
|---|---:|---|
| `enrichment/db/pipeline.sqlite` | 191,026 companies / 5.5M enrichments / 15,798 carriers | Master fact tables |
| `MASTER/uploads_to_drive/ALL_COMPETING_PEO_ACCOUNTS.csv` | 673 | Displacement targets with DM + incumbent PEO |
| `_sales_os_state.json` | 48 cadences | Active outreach state (touches, weights, buyer_cast, MEDDPICC) |
| `Trigger_Engine_Output.xlsx` | 934 trigger rows | WC / Health / OSHA / Hiring composite scores |
| `verification_V2.json` | 4 verdicts | Fact-check notes per company |
| `ADP_Territory_CRM_Master.xlsx` | 2,928 prospects | Territory CRM (contacts, PEO tier, pitch angles) |

## Destination schema (12 tables + 3 views)

| Table | What it holds | Final rowcount |
|---|---|---:|
| `companies` | Master deduped record. PK `id SERIAL`, UNIQUE `(name_normalized, zip)` | **190,692** |
| `contacts` | DMs / owners per company | 4,059 |
| `carriers` | Schedule A health carriers (sqlite passthrough) | 15,798 |
| `triggers` | Trigger fires (`wc_renewal`, `health_renewal`, `osha_hot`, `hiring_velocity`, `pitch_signal_primary`, `growth_signal`, `biz_event_acquisition`, `warn_filed_date`) with score + evidence | 955,846 |
| `incumbent_peo` | Known PEO (Insperity / TriNet / Paychex / etc.) per company | 1,514 |
| `cadences` | Active outreach cadences from `_sales_os_state.json` | 48 |
| `touches` | Scheduled / completed touches per cadence | 237 |
| `outcomes_ledger` | Append-only weekly outcomes ledger | 0 (none yet) |
| `notes` | Free-form notes (verification verdicts, CRM PEO Tier, talk tracks) | 3,605 |
| `tasks` | Free-form to-dos | 0 (provisioned) |
| `meddpicc` | MEDDPICC pipeline scoring per booked meeting | 0 (none yet) |
| `brokers` | Auto-recruited broker channel | 0 (none yet) |
| `weights_current` | Learned multipliers (`dim`, `key`, `mult`) | 15 |
| `weekly_metrics` | Per-week touches / progressions / meetings_booked / killed | 0 (none yet) |

### Views

| View | What |
|---|---|
| `v_today_actions` | Touches due today or earlier, ranked by cadence score |
| `v_active_pipeline` | All active cadences with next-touch date + channel |
| `v_bench_top100` | Top 100 in-territory, ICP-EE (11–55), non-disqualified, non-cadenced |

## Dedup rules (cross-source)

Companies are bucketed on `(name_normalized, zip5)` where `name_normalized` strips
everything except `[a-z0-9]` and lower-cases. When `zip5` is missing, the bucket
falls back to `(name_normalized, state)` and merges into the first existing zip
record we've seen for that name.

When a row is seen in multiple sources, later sources **fill in nulls** and **OR
booleans** but never overwrite an existing non-null scalar. The `source` column
accumulates a pipe-delimited list (e.g. `sqlite|competing_peo_csv|sales_os`) so
provenance survives the merge.

## ICP / territory filter

Mirrors `scripts/build_sales_os.py` (`EXCLUDE_NAICS_PREFIXES`, `EXCLUDE_NAME_REGEX`,
`OFF_FOCUS_NAME_PATTERNS`, `EXCLUDE_NAME_SUBSTR`, `EXCLUDE_ZIPS`). Companies that
match any rule are kept but flagged with `disqualified=TRUE` and a
`disqualified_reason` (`NAME_REGEX`, `NAICS_PREFIX`, `OFF_FOCUS_NAME`, `NAME_SUBSTR`,
`NAICS_EXACT`, `ZIP_OUT_OF_TERRITORY`, `OUT_OF_TERRITORY`, etc.).

Territory check: `state='NC' OR zip LIKE '27%' OR zip LIKE '28%'`. UNC/Duke mail-drop
ZIPs (`27599 / 27710 / 27705 / 27708 / 27704`) and RTP-proper (`27709`) are excluded
even though they match the `27` prefix.

Out of 190,692 ingested companies, **42,500 are disqualified** and **13,753 pass
all gates (in-territory + ICP EE 11–55 + non-off-focus)** — that's the bench you
want to query against `v_bench_top100`.

## Performance

- Total wall-clock for full `--fresh` migration: **~4.5 min** (dominated by the
  ~1M-row `triggers` insert and the initial 5.5M-row enrichment scan).
- Companies-only stage: ~60 sec.
- All inserts use `executemany` in 5K-row batches; `RESTART IDENTITY` on the
  `companies` truncate guarantees that the synthetic in-memory id == Neon
  SERIAL id, which lets sqlite-sourced FK rows (carriers, triggers, contacts)
  skip an id-remap round trip.

## Safety

- `DATABASE_URL` is loaded via simple `key=value` parsing of `.env`; never
  printed, never echoed in any log line.
- All inserts use psycopg parameterized queries (`%s` placeholders) — no string
  formatting against user-controllable values.
- Reading: `pipeline.sqlite` is streamed with `cur.fetchmany(50_000)` for
  enrichments and `LIMIT 10_000 OFFSET …` chunks for companies, so peak memory
  stays bounded.
- `--fresh` only drops tables this migration owns (companies, contacts, carriers,
  triggers, incumbent_peo, cadences, touches, outcomes_ledger, notes, tasks,
  meddpicc, brokers, weights_current, weekly_metrics and the three views).
  Pre-existing tables created by `scripts/sync_to_neon.py` (`buyer_cast`,
  `channel_brokers`) are left untouched.
