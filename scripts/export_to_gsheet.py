#!/usr/bin/env python3
"""Export today's actionable plan as a Google-Sheets-ready TSV.
Layout:
  Section 1: 🔥 WARM FOLLOWUPS (highest priority — already in conversation)
  Section 2: 🟢 SEND TODAY (D0 emails, verified addresses)
  Section 3: 🟡 BEST-GUESS EMAIL (send anyway, paper trail)
  Section 4: 📞 PHONE-ONLY (no DM email — dial today)
  Section 5: 🔴 DISQUALIFY
  Section 6: 📊 BENCH OVERFLOW (Mon batch overflow — research tonight)
Each row: Priority | Score | Company | County | EE | Trigger | Signals | DM | Title | Email | Phone | Today's Action | Notes
"""
import json, datetime as dt, csv, sys
from pathlib import Path

ROOT = Path("/Users/ricknini/Documents/ADP PEO")
state = json.load(open(ROOT / "_sales_os_state.json"))
TODAY = dt.date.today()

def signal_str(c):
    s = []
    if c.get("has_health_benefits"): s.append("💰HEALTH")
    if c.get("multi_state_likely"): s.append("🌐MULTI")
    if c.get("growth_tier"): s.append(f"📈{c['growth_tier'].upper()}")
    if c.get("multi_carrier_consolidation", 0) >= 3: s.append(f"🔀{c['multi_carrier_consolidation']}-carrier")
    return " ".join(s) or "—"

def has_verified_email(c):
    return bool(c.get("dm_email")) and c.get("dm_email_verified", True)  # default True since most are verified from CSV

mon = [c for c in state["active_cadences"] if c["route_day"] == 0]

# Buckets
warm = sorted([c for c in mon if c.get("status") == "warm_followup"], key=lambda x: -x.get("score", 0))
disq = [c for c in mon if c.get("disqualify_recommendation")]
mon_remaining = [c for c in mon if c.get("status") != "warm_followup" and not c.get("disqualify_recommendation")]

verified = sorted([c for c in mon_remaining if c.get("dm_email") and not c.get("dm_email","").startswith("info@")],
                  key=lambda x: -x.get("score", 0))
guess = sorted([c for c in mon_remaining if c.get("dm_email","").startswith("info@") or
                                            (c.get("dm_email") and not c.get("dm_email_verified", True))],
               key=lambda x: -x.get("score", 0))
phone_only = sorted([c for c in mon_remaining if not c.get("dm_email") and c.get("phone")],
                    key=lambda x: -x.get("score", 0))
unreachable = sorted([c for c in mon_remaining if not c.get("dm_email") and not c.get("phone")],
                     key=lambda x: -x.get("score", 0))

OUT = ROOT / "Monday_Plan_for_Sheets.tsv"
with OUT.open("w", newline="") as f:
    w = csv.writer(f, delimiter="\t")

    # Header banner
    w.writerow([f"MONDAY {TODAY.isoformat()} — {len(mon)} accounts in Wake/Triangle batch    |   "
                f"TARGETS: 45 touches · 3 meetings · 50 active accounts"])
    w.writerow([])

    # Column header (shared)
    HEADERS = ["Priority", "Score", "Company", "County", "EE", "Trigger", "Signals",
               "DM", "Title", "Email", "Phone", "Today's Action", "Notes"]

    def section(emoji_label, accounts, action_text, default_notes=""):
        if not accounts: return
        w.writerow([emoji_label + f"  ({len(accounts)})"])
        w.writerow(HEADERS)
        for c in accounts:
            history = ""
            for t in c.get("touches", []):
                if t.get("completed"):
                    sym = {"email":"E","linkedin":"L","drop":"D","call":"P","breakup":"B"}.get(t["channel"],"?")
                    history += sym + "✓ "
            notes = (c.get("enrichment_notes") or default_notes or "")[:120]
            w.writerow([
                emoji_label.split()[0],   # priority emoji only
                round(c.get("score", 0), 1),
                c.get("company", "")[:50],
                c.get("county", ""),
                c.get("ee") or "",
                c.get("primary_trigger", ""),
                signal_str(c),
                c.get("dm_name", "") or "—",
                c.get("dm_title", "") or "",
                c.get("dm_email", "") or "—",
                c.get("phone", "") or "—",
                action_text,
                (history + " | " + notes) if history else notes,
            ])
        w.writerow([])

    # Section 1: WARM FOLLOWUPS — highest priority
    section("🔥 WARM FOLLOWUPS — IN CONVERSATION ALREADY",
            warm,
            "Specific action below in Notes",
            "Reference prior touch")

    # Section 2: Verified emails to send today
    section("🟢 SEND THESE EMAILS NOW (verified addresses)",
            verified,
            "10:00–11:30 send email touch-1 (rendered body in TODAY tab)")

    # Section 3: Best-guess email (send anyway)
    section("🟡 BEST-GUESS EMAIL (send + CC info@; phone backup)",
            guess,
            "10:00–11:30 send; if bounces, call same day")

    # Section 4: Phone-only
    section("📞 PHONE TODAY (no email — call instead of email)",
            phone_only,
            "11:30–12:30 cold dial during Power Hour")

    # Section 5: Disqualify
    section("🔴 DISQUALIFY (mark in Weekly_Wrap, will be replaced)",
            disq,
            "Mark 'disqualified' — bench tops up automatically")

    # Section 6: Truly unreachable
    section("⚫ UNREACHABLE — needs research (LinkedIn/web)",
            unreachable,
            "11:30–12:30 LinkedIn lookup before next attempt")

    # Footer with weekly cascade
    w.writerow([])
    w.writerow(["📅 THIS WEEK'S CASCADE (from today's Mon seeds)"])
    w.writerow(["Date", "Day", "Touch Type", "Source"])
    week = [
        ("2026-05-12", "Tue 5/12", "Pitt-cluster D2 drops (12 acct) + Tue field route + drops for Wake-flex", "field day"),
        ("2026-05-13", "Wed 5/13", "Northern-cluster D3 drops (8 acct)", "field day"),
        ("2026-05-14", "Thu 5/14", "Cumberland-cluster D4 drops (13 acct)", "field day — heaviest"),
        ("2026-05-15", "Fri 5/15", "Office wrap: Weekly_Wrap fill + breakup emails", "office"),
        ("2026-05-18", "Mon 5/18", "NEW Mon batch D0 emails + D8 LinkedIn for today's batch + D15 calls (from 3-week-ago batch)", "office"),
    ]
    for r in week: w.writerow(r)

print(f"Saved: {OUT}")
print(f"  {len(warm)} warm followups")
print(f"  {len(verified)} verified-email sends")
print(f"  {len(guess)} best-guess sends")
print(f"  {len(phone_only)} phone-only")
print(f"  {len(disq)} disqualify")
print(f"  {len(unreachable)} unreachable (needs research)")
