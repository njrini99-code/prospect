#!/usr/bin/env python3
"""Audit the 40 active cadences in _sales_os_state.json against ICP / territory / trigger criteria.

Per CLAUDE.md:
  - ICP: 11-50 EE; Near-ICP 51-55
  - Territory: ~35 eastern NC counties; ~310 zips in enrichment/territory_zips.txt
  - RTP 27709 is OUT (even though prefix matches)
  - UNC/Duke ZIPs (27599/27710/27705/27708/27704) are mail-drops (usually NOT NC-operating)
  - Construction/trades/trucking hard-drop (NAICS 23*, 484*, 562*, 561730)
  - Mecklenburg = out of territory (rating area 4)
  - ICP industries: manufacturing, defense, logistics, biotech, professional services, light industrial
    (+ tech/engineering per memory)

Trigger quality bar:
  - wc_renewal       → must have wc_carrier + renewal date (else trigger is weak)
  - displacement     → must have incumbent + DM name + DM email
  - health_renewal   → must have plan_year + carriers
  - osha_recent      → must have evidence_date
  - hiring_velocity  → must have evidence (# jobs)
"""
import json, re
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path("/Users/ricknini/Documents/ADP PEO")
STATE = ROOT / "_sales_os_state.json"
ZIPS_FILE = ROOT / "enrichment/territory_zips.txt"

# Load territory zips
territory_zips = set()
for line in ZIPS_FILE.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#"):
        territory_zips.add(line.split(",")[0].strip().zfill(5))

# Out-of-territory zip flags (per CLAUDE.md / memory)
RTP_PROPER_ZIP = "27709"
UNC_DUKE_MAILDROPS = {"27599", "27710", "27705", "27708", "27704"}

# ENC 35-county set
ENC_COUNTIES = {
    "Wake","Durham","Orange","Johnston","Chatham","Granville","Person","Vance","Warren","Franklin",
    "Pitt","Greene","Lenoir","Wayne","Wilson",
    "Nash","Edgecombe","Halifax","Northampton","Hertford","Bertie","Martin",
    "Cumberland","Sampson","Bladen","Robeson","Hoke","Moore","Lee","Harnett","Scotland","Richmond",
    "Carteret","Craven","Pamlico","Beaufort","Hyde","Tyrrell","Washington","Dare","Currituck",
    "Camden","Pasquotank","Perquimans","Chowan","Gates","Onslow","Pender","New Hanover",
    "Brunswick","Columbus","Duplin","Jones",
}
OUT_OF_TERRITORY_COUNTIES = {"Mecklenburg","Guilford","Forsyth","Buncombe","Catawba","Iredell","Cabarrus","Union","Gaston","Cleveland","Rowan","Davidson"}

ICP_EE_MIN = 11
ICP_EE_MAX = 55

ICP_VERTICALS_OK = {
    "Engineering","Manufacturing","Technology","Tech","Health Care","Mgmt Consulting","Mgmt Cons",
    "Wholesale Trade","Biotech / Life Sci","Biotech","Pharma","Defense","Logistics",
    "Professional Services","Light Industrial","Finance/Insurance","Real Estate",
}

WEAK_VERTICALS_FLAG = {
    "Hotels (limited svc)",  # rating-area dependent
    "broader_file",          # placeholder from displacement CSV
    "1 hot list",            # ditto
    "2.6 court",
    "1D SBIR/OBBB",
}

state = json.loads(STATE.read_text())
active = state["active_cadences"]
print(f"Auditing {len(active)} active cadences\n")

flags = []  # (severity, company, message)
def flag(sev, c, msg):
    flags.append((sev, c, msg))

# ─── Per-cadence checks ───
for c in active:
    company = c["company"]
    zip_ = (c.get("zip") or "").strip().zfill(5) if c.get("zip") else ""
    county = (c.get("county") or "").strip().title()
    ee = c.get("ee")
    vertical = (c.get("vertical") or "").strip()
    trigger = c.get("primary_trigger")

    # GEO checks
    if zip_ == RTP_PROPER_ZIP:
        flag("CRITICAL", company, f"ZIP 27709 (RTP-proper) — out of territory per CLAUDE.md")
    if zip_ in UNC_DUKE_MAILDROPS:
        flag("HIGH", company, f"ZIP {zip_} — UNC/Duke mail-drop (usually NOT NC-operating)")
    if county and county in OUT_OF_TERRITORY_COUNTIES:
        flag("CRITICAL", company, f"County '{county}' is out of territory")
    if county and county not in ENC_COUNTIES and county not in OUT_OF_TERRITORY_COUNTIES:
        flag("MED", company, f"County '{county}' not in known ENC 35-county set — verify")
    if zip_ and zip_ not in territory_zips:
        flag("MED", company, f"ZIP {zip_} not in territory_zips.txt — verify")
    if not zip_ and not county:
        flag("MED", company, f"No ZIP and no county — geography unknown")

    # EE band check
    if ee is not None:
        try:
            ee_n = int(ee)
            if ee_n < ICP_EE_MIN:
                flag("CRITICAL", company, f"EE={ee_n} below ICP min ({ICP_EE_MIN})")
            elif ee_n > ICP_EE_MAX:
                flag("CRITICAL", company, f"EE={ee_n} above near-ICP max ({ICP_EE_MAX})")
            elif ee_n > 50:
                flag("INFO", company, f"EE={ee_n} in Near-ICP band (51-55)")
        except (ValueError, TypeError):
            flag("LOW", company, f"EE='{ee}' unparseable")
    else:
        flag("LOW", company, "EE unknown — score may be unreliable")

    # Vertical check
    if vertical in WEAK_VERTICALS_FLAG:
        flag("MED", company, f"Vertical '{vertical}' is a placeholder, not a real industry classification")
    if not vertical:
        flag("LOW", company, "No vertical")

    # Trigger-quality checks
    if trigger == "wc_renewal":
        if not c.get("wc_renewal"):
            flag("HIGH", company, "wc_renewal trigger but no renewal date — opener will fall back to generic")
        elif not c.get("wc_carrier"):
            flag("LOW", company, "wc_renewal: no carrier (template degrades to renewal-date-only language — works, but less personalized)")
    elif trigger == "displacement":
        if not c.get("incumbent_peo"):
            flag("HIGH", company, "displacement trigger but no incumbent_peo — wrong opener will fire")
        if not c.get("dm_name"):
            flag("MED", company, "displacement: no DM name — generic opener")
        if not c.get("dm_email"):
            flag("MED", company, "displacement: no DM email — email touch will fail")
    elif trigger == "health_renewal":
        if not c.get("plan_year") and not c.get("evidence"):
            flag("MED", company, "health_renewal trigger lacks plan_year + evidence")
    elif trigger == "osha_recent":
        if not c.get("evidence"):
            flag("MED", company, "osha_recent trigger lacks evidence")
    elif trigger == "hiring_velocity":
        if not c.get("evidence"):
            flag("MED", company, "hiring_velocity trigger lacks evidence")

    # Specific name-based red flags (additions to the script's filter)
    name_l = company.lower()
    if any(k in name_l for k in ("non-profit","nonprofit","ministry","church","county schools","public school")):
        flag("MED", company, f"Name suggests non-profit / public-sector — may not be ICP")
    if "outreach" in name_l and "services" in name_l:
        flag("LOW", company, "Outreach Services — verify ICP fit; could be social-services nonprofit")
    if "behavioral" in name_l and "services" in name_l:
        flag("LOW", company, "Behavioral Services — Medicaid-funded providers often have margin/PEO-fit issues")
    if "wealth management" in name_l:
        flag("LOW", company, "Wealth Management — small RIA shops often <11 EE despite filings; verify")

# ─── Summary ───
sev_order = {"CRITICAL":0,"HIGH":1,"MED":2,"LOW":3,"INFO":4}
flags.sort(key=lambda x: (sev_order.get(x[0], 9), x[1]))

by_sev = Counter(f[0] for f in flags)
print("=" * 78)
print(f"FLAGS BY SEVERITY  →  {dict(by_sev)}")
print("=" * 78)
for sev in ("CRITICAL","HIGH","MED","LOW","INFO"):
    these = [f for f in flags if f[0] == sev]
    if not these: continue
    print(f"\n── {sev}  ({len(these)}) ──")
    for s, c, msg in these:
        print(f"  {str(c)[:40]:40}  {msg}")

# ─── Portfolio composition ───
print("\n" + "=" * 78)
print("PORTFOLIO COMPOSITION")
print("=" * 78)
print(f"By trigger    : {dict(Counter(c['primary_trigger'] for c in active))}")
print(f"By route day  : {dict(Counter(c['route_day'] for c in active))}")
print(f"By county     : {dict(Counter(c.get('county','(none)') for c in active).most_common(12))}")
print(f"By vertical   : {dict(Counter(c.get('vertical','') or '(none)' for c in active).most_common(15))}")

ee_known = [c.get('ee') for c in active if c.get('ee') is not None]
if ee_known:
    print(f"EE band       : min={min(ee_known)}  max={max(ee_known)}  median={sorted(ee_known)[len(ee_known)//2]}  n_known={len(ee_known)}/{len(active)}")

# Incumbent breakdown for displacement
disp = [c for c in active if c.get('primary_trigger') == 'displacement']
if disp:
    incumbents = Counter()
    for c in disp:
        ip = (c.get('incumbent_peo') or '').strip()
        # canonicalize
        ipl = ip.lower()
        if 'insperity' in ipl: incumbents['Insperity'] += 1
        elif 'trinet' in ipl: incumbents['TriNet'] += 1
        elif 'paychex' in ipl: incumbents['Paychex'] += 1
        elif 'justworks' in ipl: incumbents['Justworks'] += 1
        elif 'questco' in ipl: incumbents['Questco'] += 1
        elif 'coadvantage' in ipl: incumbents['CoAdvantage'] += 1
        elif 'unknown' in ipl or not ip: incumbents['Unknown/Other'] += 1
        else: incumbents[ip[:18]] += 1
    print(f"Incumbents    : {dict(incumbents.most_common())}")

# Recommended verdict
print("\n" + "=" * 78)
print("VERDICT")
print("=" * 78)
critical = by_sev.get("CRITICAL", 0)
high = by_sev.get("HIGH", 0)
med = by_sev.get("MED", 0)
if critical > 0:
    print(f"  ✗ {critical} CRITICAL flag(s) — must remediate before Monday")
elif high > 3:
    print(f"  ⚠ {high} HIGH flags — review before Monday; some cadences may misfire")
elif high > 0:
    print(f"  ✓ {high} HIGH flag(s); manageable. Patch and proceed.")
else:
    print(f"  ✓ No blockers. Portfolio passes geo/EE/trigger sanity.")
if med > 0:
    print(f"  ℹ {med} MED-severity items — investigate over the week, not blockers")
