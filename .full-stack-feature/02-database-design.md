# Database Design: ADP PEO Sales OS CRM

> Schema spec. The concurrent migration agent (`scripts/migrate_to_neon.py`) implements this against Neon Postgres 17. Drizzle schema files in `crm/db/schema.ts` mirror it 1:1.

## Design principles

- **Companies are the root entity.** Every other table joins back to `companies.id`.
- **Append-only where it matters** — `outcomes_ledger`, `notes`, `tasks` never delete; `cadences`/`touches` are mutated.
- **Dedupe at write time** — migration enforces `UNIQUE (name_normalized, zip5)` across sources so a company that appears in pipeline.sqlite AND ALL_COMPETING_PEO_ACCOUNTS.csv AND ADP_Territory_CRM_Master.xlsx ends up as ONE row with merged data.
- **No soft deletes in v1** — disqualification is a flag on `companies.status`, not a DELETE.
- **Read-heavy bias** — 99% of access is SELECT; bulk INSERT happens twice per week (Sunday rebuild + ad-hoc touch logging). Index for read patterns.
- **One-to-many over arrays** — contacts/triggers/enrichments are separate rows, not JSONB arrays on companies, because we filter on them.

## Entity-Relationship Diagram

```
                          ┌─────────────────┐
                          │   companies     │◀─┐
                          │  (PK: id)       │  │
                          └────────┬────────┘  │
                                   │           │
       ┌──────────────┬────────────┼────────────────────────┐
       │              │            │            │           │
       ▼              ▼            ▼            ▼           ▼
  ┌─────────┐  ┌────────────┐ ┌─────────┐  ┌────────┐  ┌────────────┐
  │contacts │  │  carriers  │ │triggers │  │ notes  │  │incumbent_  │
  │         │  │ (health)   │ │         │  │        │  │   peo      │
  └─────────┘  └────────────┘ └─────────┘  └────────┘  └────────────┘
       │
       ▼
  ┌─────────┐
  │ tasks   │
  └─────────┘

                          ┌─────────────────┐
                          │   cadences      │
                          │  (PK: id)       │
                          │  FK: company_id │
                          └────────┬────────┘
                                   │
                ┌──────────────────┼──────────────────┐
                ▼                  ▼                  ▼
          ┌──────────┐      ┌──────────────┐   ┌──────────────┐
          │ touches  │      │   meddpicc   │   │ (cadence has │
          │ (5/cad)  │      │ (when book   │   │  many touches)│
          └────┬─────┘      │ meeting)     │   └──────────────┘
               │            └──────────────┘
               ▼
          ┌──────────────┐
          │outcomes_     │
          │ ledger       │
          └──────────────┘

  ┌────────────┐     ┌─────────────────┐     ┌────────────────┐
  │  brokers   │     │ weights_current │     │weekly_metrics  │
  │ (no FK —   │     │ (singleton-ish: │     │ (one row per   │
  │ auto-      │     │  one row per    │     │  week_start)   │
  │ recruited) │     │  dim:key combo) │     └────────────────┘
  └────────────┘     └─────────────────┘
```

## Table specs

### `companies` — master deduped company record

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `name` | TEXT NOT NULL | Display name |
| `name_normalized` | TEXT NOT NULL | Lowercase, alphanumeric only — dedupe key |
| `city` | TEXT | |
| `county` | TEXT | Backfilled from ZIP if missing |
| `state` | CHAR(2) DEFAULT 'NC' | Enforced 'NC' at INSERT |
| `zip` | CHAR(5) | First 5 of ZIP+4 |
| `ein` | TEXT | If known from IRS |
| `domain` | TEXT | From email pattern + website |
| `website` | TEXT | |
| `linkedin_url` | TEXT | |
| `naics` | TEXT | Inferred from sources |
| `vertical` | TEXT | Human bucket (Manufacturing, HVAC, Engineering, etc.) |
| `ee` | INTEGER | Employee count (best-known) |
| `ee_source` | TEXT | Where ee value came from (5500, indeed, dol, etc.) |
| `multi_state_likely` | BOOLEAN DEFAULT FALSE | Federal contractor / DoD UEI / multi-location filing signal |
| `fed_contractor` | BOOLEAN DEFAULT FALSE | |
| `has_5500` | BOOLEAN DEFAULT FALSE | Filed own 5500 = has benefits = budget |
| `has_health_carriers` | BOOLEAN DEFAULT FALSE | Has Schedule A carriers identified |
| `growth_signal` | TEXT | RAPID/STRONG/MODERATE/FLAT/STABLE |
| `pitch_signal` | TEXT | WC_LAPSED / OSHA_CONFIRMED / FOREIGN_LABOR / etc. |
| `pitch_angle` | TEXT | Pre-computed pitch sentence per pitch_signal |
| `status` | TEXT DEFAULT 'bench' | bench / active / nurture / disqualified / won / lost |
| `disqualified` | BOOLEAN DEFAULT FALSE | |
| `disqualify_reason` | TEXT | Why disqualified (worked / off-territory / off-ICP / etc.) |
| `source` | TEXT | Which file/table seeded this row |
| `first_seen` | TIMESTAMPTZ DEFAULT NOW() | |
| `last_updated` | TIMESTAMPTZ DEFAULT NOW() | |

**Indexes:**
- `UNIQUE (name_normalized, zip)`
- `INDEX (status, vertical)` — most common filter
- `INDEX (county, state)` — route-day filtering
- `INDEX (status) WHERE disqualified = false` — partial, for the active universe
- `INDEX (has_health_carriers, multi_state_likely) WHERE disqualified = false` — ICP filter on the bench

### `contacts` — DMs, owners, decision-makers per company

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `name` | TEXT NOT NULL | Full name |
| `title` | TEXT | President / CEO / COO / Owner / etc. |
| `email` | TEXT | |
| `email_verified` | BOOLEAN DEFAULT FALSE | Whether we've confirmed via send/bounce or external source |
| `phone` | TEXT | |
| `linkedin_url` | TEXT | |
| `is_primary` | BOOLEAN DEFAULT FALSE | The active DM for outreach |
| `role` | TEXT | owner / cfo / office_mom / broker / cpa / attorney / other |
| `source` | TEXT | Where this contact was identified |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `last_updated` | TIMESTAMPTZ DEFAULT NOW() | |

**Indexes:**
- `INDEX (company_id, is_primary)` — get primary contact fast
- `INDEX (company_id, role)` — get broker, CPA, etc.
- `UNIQUE (company_id, email) WHERE email IS NOT NULL`

### `carriers` — Schedule A health carriers per company

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `carrier_name` | TEXT NOT NULL | BCBS NC / METLIFE / etc. |
| `benefit_type` | TEXT | medical / dental / vision / life / etc. |
| `naic` | TEXT | NAIC carrier code |
| `premium` | NUMERIC | Annual premium if known |
| `covered_lives` | INTEGER | |
| `plan_year` | INTEGER | |
| `source` | TEXT | dol_5500_bulk / etc. |

**Indexes:**
- `INDEX (company_id)`
- `INDEX (carrier_name)` — for "which accounts are on UnitedHealth" type queries

### `triggers` — every buying signal that fires per company

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `trigger_type` | TEXT NOT NULL | wc_renewal / health_renewal / osha_recent / hiring_velocity / ale_threshold / wc_lapsed / wc_recent_change / foreign_labor / carrier_consolidation / shrinking_county / dod_contractor / warn_layoff / displacement / has_5500 |
| `weight` | NUMERIC NOT NULL | Score contribution (5.5 for wc_lapsed, etc.) |
| `evidence` | TEXT | Specific data point that fired the trigger |
| `evidence_date` | DATE | When the trigger event happened (renewal date, OSHA cite date, etc.) |
| `days_to_event` | INTEGER | For renewal-anchored triggers: days until renewal |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `still_active` | BOOLEAN DEFAULT TRUE | Set false when trigger expires (renewal date passed, etc.) |

**Indexes:**
- `INDEX (company_id, trigger_type)`
- `INDEX (trigger_type, still_active) WHERE still_active = TRUE`
- `INDEX (evidence_date)` — for "WC renewals firing next 90 days" type queries

### `incumbent_peo` — confirmed PEO incumbents

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `peo_brand` | TEXT NOT NULL | Insperity / TriNet / Paychex / Justworks / Questco / Oasis / Vensure / etc. |
| `peo_canonical` | TEXT | Mapped to one of: Insperity, TriNet, Paychex, Justworks, Questco, Other |
| `evidence` | TEXT | "Listed on 5500 Schedule MEP Part 2, plan year 2024" / etc. |
| `evidence_date` | DATE | |
| `is_stale` | BOOLEAN DEFAULT FALSE | TRUE if evidence contains 'expired'/'lapsed'/'cancelled' |
| `confidence` | TEXT | high / medium / low |
| `source` | TEXT | |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

**Indexes:**
- `INDEX (company_id)`
- `INDEX (peo_canonical, is_stale)` — for "all TriNet displacement targets" queries

### `cadences` — active outreach cadences

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `status` | TEXT NOT NULL DEFAULT 'active' | active / warm_followup / completed / killed / nurture |
| `start_date` | DATE NOT NULL | When D0 fires |
| `route_day` | SMALLINT NOT NULL | 0=Mon Wake, 1=Tue Pitt, 2=Wed Northern, 3=Thu Cumberland |
| `tier` | TEXT | Top / Mid / Wildcard |
| `primary_trigger` | TEXT | Anchor trigger this cadence is built around |
| `score` | NUMERIC | Final score at seed time |
| `score_raw` | NUMERIC | Pre-overlay base score |
| `score_overlay` | NUMERIC | Additive boost (health/multi-state/growth) |
| `weight_mult` | NUMERIC | Multiplicative learned weight |
| `incumbent_peo` | TEXT | If displacement, the canonical incumbent |
| `incumbent_stale` | BOOLEAN | |
| `wc_carrier` | TEXT | If WC trigger |
| `wc_renewal` | TEXT | Renewal date string |
| `days_out` | INTEGER | Days until renewal |
| `evidence` | TEXT | Free-form evidence summary |
| `talk_track` | TEXT | Pre-built opener (from CSV or generated) |
| `enrichment_notes` | TEXT | Operator notes (e.g., "WARM. Sept H&B renewal. ...") |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `killed_at` | TIMESTAMPTZ | If status=killed |
| `nurture_until` | DATE | If status=nurture, when to re-fire |

**Indexes:**
- `INDEX (company_id)` (one active cadence per company in practice)
- `INDEX (status, route_day)` — get today's batch
- `INDEX (start_date)` — for cascade computation
- `UNIQUE (company_id) WHERE status IN ('active', 'warm_followup')` — only one live cadence per account

### `touches` — every scheduled/completed touch

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `cadence_id` | INTEGER REFERENCES cadences(id) ON DELETE CASCADE | |
| `day_offset` | SMALLINT NOT NULL | 0, 3, 8, 15, 22 |
| `channel` | TEXT NOT NULL | email / linkedin / drop / call / breakup |
| `scheduled_for` | DATE NOT NULL | Computed at cadence-seed time |
| `completed` | BOOLEAN DEFAULT FALSE | |
| `outcome` | TEXT | no_answer / voicemail / gatekeeper / owner_convo / meeting_booked / meeting_held / meeting_cancelled / meeting_no_show / disqualified / not_interested / dnc / wrong_number / dead / acquired / nurture_90d |
| `notes` | TEXT | |
| `broker_captured` | TEXT | Broker name if captured during this touch |
| `completed_at` | TIMESTAMPTZ | |

**Indexes:**
- `INDEX (cadence_id, day_offset)`
- `INDEX (scheduled_for) WHERE NOT completed` — get today's actions
- `INDEX (scheduled_for, channel)` — for cadence-tracker rollups

### `outcomes_ledger` — append-only outcome log

| Column | Type | Notes |
|---|---|---|
| `id` | BIGSERIAL PRIMARY KEY | |
| `touch_id` | INTEGER REFERENCES touches(id) | |
| `company_id` | INTEGER NOT NULL | denormalized for fast joins |
| `week_start` | DATE | ISO Monday for the week the outcome was logged |
| `logged_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `channel` | TEXT NOT NULL | |
| `outcome` | TEXT NOT NULL | |
| `broker_captured` | TEXT | |
| `notes` | TEXT | |

**Indexes:**
- `INDEX (week_start)` — weekly rollups
- `INDEX (company_id, logged_at DESC)` — account timeline
- `INDEX (outcome) WHERE outcome IN ('meeting_booked','meeting_held')` — pipeline filter

### `notes` — free-form account-level notes

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `body` | TEXT NOT NULL | Markdown |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |
| `last_updated` | TIMESTAMPTZ DEFAULT NOW() | |

### `tasks` — free-form to-dos per company

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `company_id` | INTEGER REFERENCES companies(id) ON DELETE CASCADE | |
| `body` | TEXT NOT NULL | |
| `due_date` | DATE | |
| `done` | BOOLEAN DEFAULT FALSE | |
| `created_at` | TIMESTAMPTZ DEFAULT NOW() | |

### `meddpicc` — pipeline scoring per booked account

| Column | Type | Notes |
|---|---|---|
| `company_id` | INTEGER PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE | |
| `first_meeting_date` | DATE | |
| `stage` | TEXT NOT NULL DEFAULT 'discovery_scheduled' | discovery_scheduled / discovery_held / proposal_sent / closed_won / closed_lost / nurture |
| `m_metrics` | TEXT | What's the quantified value to them |
| `e_econ_buyer` | TEXT | Named decision-maker who controls budget |
| `d1_decision_criteria` | TEXT | |
| `d2_decision_process` | TEXT | |
| `p_paper_process` | TEXT | |
| `i_pain` | TEXT | Identified pain |
| `c_champion` | TEXT | Named internal champion |
| `cmp_competition` | TEXT | Current state / competitor |
| `next_action` | TEXT | |
| `est_deal_value` | NUMERIC | Computed: ee × ~$1500 annual rev |
| `last_updated` | TIMESTAMPTZ DEFAULT NOW() | |

**Indexes:**
- `INDEX (stage)` — kanban grouping
- `INDEX (last_updated DESC)` — recent-activity view

### `brokers` — auto-recruited broker channel list

| Column | Type | Notes |
|---|---|---|
| `id` | SERIAL PRIMARY KEY | |
| `name` | TEXT UNIQUE NOT NULL | |
| `first_seen` | DATE NOT NULL | |
| `first_seen_via_company_id` | INTEGER REFERENCES companies(id) | The drop where we discovered them |
| `county` | TEXT | |
| `phone` | TEXT | |
| `email` | TEXT | |
| `last_brief_sent` | DATE | Last quarterly compliance brief drop |
| `lunch_status` | TEXT | "not_yet" / "scheduled" / "had_one" / "regular" |
| `n_clients_observed` | INTEGER DEFAULT 1 | Count of accounts where we've seen this broker |
| `notes` | TEXT | |

**Indexes:**
- `INDEX (n_clients_observed DESC)` — most-leveraged brokers first

### `weights_current` — learned multipliers (singleton state)

| Column | Type | Notes |
|---|---|---|
| `k` | TEXT PRIMARY KEY | "{dim}:{key}" composite (e.g., "trigger:wc_lapsed") |
| `dim` | TEXT NOT NULL | trigger / vertical / channel / route_day |
| `key` | TEXT NOT NULL | Within-dim key (wc_lapsed, Engineering, email, 0) |
| `multiplier` | NUMERIC NOT NULL | Learned weight (0.5–2.0 clamped) |
| `last_recomputed` | DATE | |
| `n_outcomes_at_recompute` | INTEGER | How many outcomes were in the ledger at recompute time |

**Indexes:**
- `INDEX (dim)`

### `weekly_metrics` — weekly KPI rollups

| Column | Type | Notes |
|---|---|---|
| `week_start` | DATE PRIMARY KEY | ISO Monday |
| `touches_total` | INTEGER NOT NULL | |
| `progressions` | INTEGER NOT NULL | Outcomes in {gatekeeper, owner_convo, meeting_booked, meeting_held} |
| `meetings_booked` | INTEGER NOT NULL | |
| `meetings_held` | INTEGER NOT NULL | |
| `killed` | INTEGER NOT NULL | DEAD/DNC/etc. |
| `broker_captures` | INTEGER NOT NULL | |
| `recomputed_at` | TIMESTAMPTZ DEFAULT NOW() | |

## Views

### `v_today_actions`

```sql
CREATE OR REPLACE VIEW v_today_actions AS
SELECT
  c.id AS company_id,
  c.name AS company,
  c.county,
  c.ee,
  cad.score,
  cad.primary_trigger,
  cad.incumbent_peo,
  cad.status,
  ct.name AS dm_name,
  ct.title AS dm_title,
  ct.email AS dm_email,
  ct.phone AS dm_phone,
  t.id AS touch_id,
  t.channel,
  t.day_offset,
  t.scheduled_for,
  cad.talk_track,
  c.pitch_angle
FROM touches t
JOIN cadences cad ON cad.id = t.cadence_id
JOIN companies c ON c.id = cad.company_id
LEFT JOIN contacts ct ON ct.company_id = c.id AND ct.is_primary = TRUE
WHERE t.scheduled_for = CURRENT_DATE
  AND NOT t.completed
  AND cad.status IN ('active', 'warm_followup')
ORDER BY cad.score DESC;
```

### `v_active_pipeline`

```sql
CREATE OR REPLACE VIEW v_active_pipeline AS
SELECT m.*,
       c.name AS company,
       c.county,
       c.ee,
       (c.ee * 1500)::INTEGER AS est_deal_value_calc
FROM meddpicc m
JOIN companies c ON c.id = m.company_id
WHERE m.stage NOT IN ('closed_lost', 'nurture')
ORDER BY m.last_updated DESC;
```

### `v_bench_top100`

```sql
CREATE OR REPLACE VIEW v_bench_top100 AS
SELECT c.*,
       (SELECT json_agg(json_build_object('type', tr.trigger_type, 'weight', tr.weight))
        FROM triggers tr
        WHERE tr.company_id = c.id AND tr.still_active) AS active_triggers,
       (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = TRUE LIMIT 1) AS dm_name
FROM companies c
WHERE c.status = 'bench'
  AND c.disqualified = FALSE
  AND c.state = 'NC'
ORDER BY (
  SELECT COALESCE(SUM(tr.weight), 0)
  FROM triggers tr
  WHERE tr.company_id = c.id AND tr.still_active
) DESC
LIMIT 100;
```

## Migration strategy

### One-time bootstrap (Step 4)
1. `DROP TABLE … CASCADE` on every CRM table if `--fresh`
2. `CREATE TABLE` + indexes + views
3. ETL in dependency order: companies → contacts → carriers → triggers → incumbent_peo → cadences → touches → outcomes_ledger → meddpicc → brokers → weights_current → weekly_metrics
4. Refresh materialized views (none in v1, but room to add)
5. Print row counts per table + per source

### Ongoing
- Drizzle migrations checked into `crm/drizzle/migrations/`
- Each schema change is a migration + a `drizzle-kit generate`
- The Python `build_sales_os.py` already INSERTs/UPSERTs into the existing v1 sync tables — the new schema is mostly additive; renames are handled via migration

## Query patterns expected

| Pattern | Expected QPS (local) | Index |
|---|---|---|
| `SELECT * FROM v_today_actions` | 1–5/min | scheduled_for + status partial |
| Account search (typeahead) | 5–20/min | `INDEX (name_normalized text_pattern_ops)` |
| Filter accounts by trigger | 10/min | `INDEX (trigger_type, still_active)` |
| Pipeline kanban | 1–5/min | `INDEX (stage)` |
| Bench browser (filtered) | 5/min | Composite — generated based on filters |
| Touch logging (write) | 5–20/day | trivial |
| Weekly rollup (cron-style) | once/week | scan |

## Data access pattern (Drizzle ORM)

`crm/db/schema.ts` declares all 12 tables + the 3 views. `crm/db/queries.ts` exposes high-level helpers:

```typescript
// Read patterns
getTodayActions(): Promise<TodayAction[]>
getAccountById(id: number): Promise<AccountWithRelations>
searchAccounts(query: string, filters: AccountFilters): Promise<Company[]>
getPipelineByStage(): Promise<Record<Stage, MeddpiccRow[]>>
getBenchPage(filters: BenchFilters, page: number): Promise<Company[]>
getWeeklyDashboard(weekStart: Date): Promise<DashboardData>

// Write patterns (called from Server Actions)
logTouchOutcome(touchId, outcome, notes, brokerCaptured): Promise<void>
addNote(companyId, body): Promise<void>
addTask(companyId, body, dueDate?): Promise<void>
disqualifyAccount(companyId, reason): Promise<void>
promoteToActive(companyId, routeDay): Promise<void>
updateMeddpicc(companyId, field, value): Promise<void>
```

All write functions wrap in a transaction and update `companies.last_updated`.

## Data protection

- No PII in Drizzle schema files (it's just types)
- `DATABASE_URL` read from `.env.local` only — never logged
- Constraints enforce state='NC' at INSERT (defense-in-depth)
- Disqualified accounts visible (so we don't re-add them) but flagged via `disqualified=true`
