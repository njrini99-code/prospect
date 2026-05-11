#!/usr/bin/env python3
"""Push Sales OS state to Neon Postgres for ad-hoc SQL + dashboarding.

Tables:
  cadences         — one row per active cadence (current snapshot)
  touches          — every scheduled/completed touch
  outcomes         — append-only ledger of completed outcomes
  weekly_metrics   — rolled-up per-week numbers
  buyer_cast       — per-account buyer mapping (owner, broker, CPA, etc.)
  meddpicc         — pipeline scoring per account that booked a meeting
  channel_brokers  — auto-recruited broker channel list

Pattern: TRUNCATE + INSERT (full refresh) for snapshot tables;
APPEND-only for outcomes (idempotent on (company_key, scheduled_for, channel)).

Connection: reads DATABASE_URL from .env. Never echoes credential."""
import os, json, datetime as dt, sys
from pathlib import Path

ROOT = Path("/Users/ricknini/Documents/ADP PEO")

# Load .env without echoing values
for line in (ROOT / ".env").read_text().splitlines():
    if "=" in line and not line.strip().startswith("#"):
        k, v = line.split("=", 1)
        os.environ.setdefault(k.strip(), v.strip())

DSN = os.environ.get("DATABASE_URL")
if not DSN:
    print("✗ DATABASE_URL not set in .env", file=sys.stderr)
    sys.exit(1)

import psycopg

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS cadences (
  company_key TEXT PRIMARY KEY,
  company TEXT NOT NULL,
  city TEXT,
  county TEXT,
  zip TEXT,
  phone TEXT,
  ee INTEGER,
  vertical TEXT,
  naics TEXT,
  score NUMERIC,
  score_raw NUMERIC,
  score_overlay NUMERIC,
  weight_mult NUMERIC,
  primary_trigger TEXT,
  incumbent_peo TEXT,
  incumbent_stale BOOLEAN,
  wc_carrier TEXT,
  wc_renewal TEXT,
  days_out INTEGER,
  dm_name TEXT,
  dm_title TEXT,
  dm_email TEXT,
  website TEXT,
  linkedin_url TEXT,
  status TEXT,
  has_health_benefits BOOLEAN,
  multi_state_likely BOOLEAN,
  growth_tier TEXT,
  multi_carrier_consolidation INTEGER,
  fitness_tier TEXT,
  start_date DATE,
  route_day INTEGER,
  enrichment_notes TEXT,
  evidence TEXT,
  talk_track TEXT,
  disqualify_recommendation BOOLEAN,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS touches (
  id BIGSERIAL PRIMARY KEY,
  company_key TEXT,
  day_offset INTEGER,
  channel TEXT,
  scheduled_for DATE,
  completed BOOLEAN DEFAULT FALSE,
  outcome TEXT,
  notes TEXT,
  broker_captured TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_key, scheduled_for, channel, day_offset)
);

CREATE TABLE IF NOT EXISTS outcomes_ledger (
  id BIGSERIAL PRIMARY KEY,
  week_start DATE,
  logged_at DATE,
  company_key TEXT,
  company TEXT,
  trigger TEXT,
  vertical TEXT,
  channel TEXT,
  day_offset INTEGER,
  route_day INTEGER,
  scheduled_for DATE,
  outcome TEXT,
  broker_captured TEXT,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS buyer_cast (
  company_key TEXT PRIMARY KEY,
  owner TEXT,
  cfo TEXT,
  office_mom TEXT,
  broker TEXT,
  cpa TEXT,
  attorney TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS meddpicc (
  company_key TEXT PRIMARY KEY,
  company TEXT,
  first_meeting_date DATE,
  stage TEXT,
  m_metrics TEXT,
  e_econ_buyer TEXT,
  d1_decision_criteria TEXT,
  d2_decision_process TEXT,
  p_paper_process TEXT,
  i_pain TEXT,
  c_champion TEXT,
  cmp_competition TEXT,
  next_action TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channel_brokers (
  name TEXT PRIMARY KEY,
  first_seen DATE,
  first_seen_via TEXT,
  county TEXT,
  phone TEXT,
  email TEXT,
  last_brief_sent DATE,
  lunch_status TEXT,
  n_clients_observed INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS weights_current (
  k TEXT PRIMARY KEY,
  dim TEXT,
  multiplier NUMERIC,
  last_recomputed DATE,
  n_outcomes_at_recompute INTEGER
);

-- Convenience view: Monday batch with action status
CREATE OR REPLACE VIEW v_monday_batch AS
SELECT c.company, c.county, c.ee, c.score, c.primary_trigger,
       c.has_health_benefits, c.multi_state_likely, c.growth_tier,
       c.dm_name, c.dm_title, c.dm_email, c.phone,
       c.incumbent_peo, c.enrichment_notes,
       (SELECT scheduled_for FROM touches t
        WHERE t.company_key = c.company_key AND NOT t.completed
        ORDER BY scheduled_for ASC LIMIT 1) AS next_touch_date,
       (SELECT channel FROM touches t
        WHERE t.company_key = c.company_key AND NOT t.completed
        ORDER BY scheduled_for ASC LIMIT 1) AS next_touch_channel
FROM cadences c
WHERE c.route_day = 0
ORDER BY c.score DESC;
"""

def main():
    state = json.loads((ROOT / "_sales_os_state.json").read_text())
    today = dt.date.today()

    with psycopg.connect(DSN) as conn:
        with conn.cursor() as cur:
            print("Creating schema (idempotent)...")
            cur.execute(SCHEMA_SQL)

            # ── CADENCES (full refresh) ──
            cur.execute("TRUNCATE cadences CASCADE")
            cad_rows = []
            for c in state["active_cadences"]:
                cad_rows.append((
                    c["key"], c["company"], c.get("city"), c.get("county"),
                    c.get("zip"), c.get("phone"), c.get("ee"),
                    c.get("vertical"), c.get("naics"),
                    c.get("score"), c.get("score_raw"), c.get("score_overlay"),
                    c.get("weight_mult"),
                    c.get("primary_trigger"), c.get("incumbent_peo"),
                    bool(c.get("incumbent_stale")),
                    c.get("wc_carrier"), c.get("wc_renewal"),
                    c.get("days_out"),
                    c.get("dm_name"), c.get("dm_title"), c.get("dm_email"),
                    c.get("website"), c.get("linkedin_url"),
                    c.get("status"),
                    bool(c.get("has_health_benefits")),
                    bool(c.get("multi_state_likely")),
                    c.get("growth_tier"),
                    c.get("multi_carrier_consolidation", 0),
                    c.get("fitness_tier"),
                    c.get("start_date"), c.get("route_day"),
                    c.get("enrichment_notes"),
                    c.get("evidence"), c.get("talk_track"),
                    bool(c.get("disqualify_recommendation")),
                ))
            cur.executemany("""
                INSERT INTO cadences (company_key, company, city, county, zip, phone, ee,
                  vertical, naics, score, score_raw, score_overlay, weight_mult,
                  primary_trigger, incumbent_peo, incumbent_stale,
                  wc_carrier, wc_renewal, days_out,
                  dm_name, dm_title, dm_email, website, linkedin_url, status,
                  has_health_benefits, multi_state_likely, growth_tier,
                  multi_carrier_consolidation, fitness_tier,
                  start_date, route_day, enrichment_notes, evidence, talk_track,
                  disqualify_recommendation)
                VALUES (%s,%s,%s,%s,%s,%s,%s, %s,%s,%s,%s,%s,%s,
                        %s,%s,%s, %s,%s,%s, %s,%s,%s,%s,%s,%s,
                        %s,%s,%s, %s,%s, %s,%s,%s,%s,%s, %s)
            """, cad_rows)
            print(f"  cadences: {len(cad_rows)} rows")

            # ── TOUCHES (full refresh — one row per touch in active state) ──
            cur.execute("TRUNCATE touches")
            touch_rows = []
            for c in state["active_cadences"]:
                for t in c.get("touches", []):
                    touch_rows.append((
                        c["key"], t.get("day"), t.get("channel"),
                        t.get("scheduled_for"), bool(t.get("completed")),
                        t.get("outcome"), t.get("notes"),
                        t.get("broker_captured"),
                    ))
            cur.executemany("""
                INSERT INTO touches (company_key, day_offset, channel, scheduled_for,
                                     completed, outcome, notes, broker_captured)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            """, touch_rows)
            print(f"  touches: {len(touch_rows)} rows")

            # ── OUTCOMES LEDGER (append-only — dedup by natural key) ──
            ol_rows = []
            for o in state.get("weekly_outcomes", []):
                ol_rows.append((
                    o.get("week_start"), o.get("logged_at"),
                    o.get("company_key"), o.get("company"),
                    o.get("trigger"), o.get("vertical"),
                    o.get("channel"), o.get("day_offset"), o.get("route_day"),
                    o.get("scheduled_for"), o.get("outcome"),
                    o.get("broker_captured"), o.get("notes"),
                ))
            cur.execute("TRUNCATE outcomes_ledger")
            cur.executemany("""
                INSERT INTO outcomes_ledger (week_start, logged_at, company_key, company,
                  trigger, vertical, channel, day_offset, route_day, scheduled_for,
                  outcome, broker_captured, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, ol_rows)
            print(f"  outcomes_ledger: {len(ol_rows)} rows")

            # ── BUYER CAST ──
            cur.execute("TRUNCATE buyer_cast")
            bc_rows = []
            for k, v in state.get("buyer_cast", {}).items():
                bc_rows.append((k, v.get("owner"), v.get("cfo"), v.get("office_mom"),
                               v.get("broker"), v.get("cpa"), v.get("attorney")))
            cur.executemany("""
                INSERT INTO buyer_cast (company_key, owner, cfo, office_mom, broker, cpa, attorney)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
            """, bc_rows)
            print(f"  buyer_cast: {len(bc_rows)} rows")

            # ── MEDDPICC ──
            cur.execute("TRUNCATE meddpicc")
            mp_rows = []
            for k, m in state.get("meddpicc", {}).items():
                mp_rows.append((k, m.get("company"), m.get("first_meeting_date"),
                               m.get("stage"), m.get("M_metrics"), m.get("E_econ_buyer"),
                               m.get("D1_decision_criteria"), m.get("D2_decision_process"),
                               m.get("P_paper_process"), m.get("I_pain"),
                               m.get("C_champion"), m.get("Cmp_competition"),
                               m.get("next_action")))
            cur.executemany("""
                INSERT INTO meddpicc (company_key, company, first_meeting_date, stage,
                  m_metrics, e_econ_buyer, d1_decision_criteria, d2_decision_process,
                  p_paper_process, i_pain, c_champion, cmp_competition, next_action)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            """, mp_rows)
            print(f"  meddpicc: {len(mp_rows)} rows")

            # ── CHANNEL BROKERS ──
            cur.execute("TRUNCATE channel_brokers")
            cb_rows = []
            for b in state.get("channel_build", {}).get("brokers", []):
                cb_rows.append((b.get("name"), b.get("first_seen"),
                               b.get("first_seen_via"), b.get("county"),
                               b.get("phone"), b.get("email"),
                               b.get("last_brief_sent") or None,
                               b.get("lunch_status"),
                               b.get("n_clients_observed"), b.get("notes")))
            cur.executemany("""
                INSERT INTO channel_brokers (name, first_seen, first_seen_via, county,
                  phone, email, last_brief_sent, lunch_status, n_clients_observed, notes)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                ON CONFLICT (name) DO UPDATE SET
                  n_clients_observed = EXCLUDED.n_clients_observed,
                  last_brief_sent = EXCLUDED.last_brief_sent
            """, cb_rows)
            print(f"  channel_brokers: {len(cb_rows)} rows")

            # ── WEIGHTS ──
            cur.execute("TRUNCATE weights_current")
            w = state.get("weights", {})
            last = w.get("last_recomputed")
            n = w.get("n_outcomes_at_recompute", 0)
            wrows = []
            for dim in ("trigger", "vertical", "channel", "route_day"):
                for k, mult in (w.get(dim) or {}).items():
                    wrows.append((f"{dim}:{k}", dim, mult, last, n))
            cur.executemany("""
                INSERT INTO weights_current (k, dim, multiplier, last_recomputed, n_outcomes_at_recompute)
                VALUES (%s,%s,%s,%s,%s)
            """, wrows)
            print(f"  weights_current: {len(wrows)} rows")

            conn.commit()

            # Verify
            tabs = cur.execute("""
                SELECT table_name, (SELECT COUNT(*)::text FROM information_schema.columns
                                    WHERE table_name = t.table_name)
                FROM information_schema.tables t
                WHERE table_schema = 'public' ORDER BY table_name
            """).fetchall()
            print()
            print("Tables in Neon:")
            for tn, ncols in tabs:
                row_count = cur.execute(f"SELECT COUNT(*) FROM {tn}").fetchone()[0]
                print(f"  {tn:25} {row_count:>4} rows  ({ncols} cols)")

if __name__ == "__main__":
    main()
