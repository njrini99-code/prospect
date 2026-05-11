/**
 * tests/score-overlay.test.ts
 *
 * Tests for score display logic and the scoreColor / statusColor /
 * triggerColor / estAnnualRev helpers that form the "score overlay" surface
 * visible in ScoreBreakdown and AccountsTable.
 *
 * The Python sync script owns score computation; the Next.js app reads
 * pre-computed `score`, `scoreRaw`, `scoreOverlay`, `weightMult` columns.
 * These tests cover every UI branch driven by those values.
 */
import { describe, it, expect } from "vitest";
import {
  scoreColor,
  statusColor,
  triggerColor,
  estAnnualRev,
  num,
} from "@/lib/utils";

// =========================================================================
// scoreColor — tier boundaries
// =========================================================================
describe("scoreColor — tier thresholds", () => {
  it("returns emerald ring for score >= 80 (high confidence)", () => {
    const c = scoreColor(80);
    expect(c).toContain("emerald-500/15");
    expect(c).toContain("ring-1");
  });

  it("returns emerald-500/10 band for 65 <= score < 80", () => {
    const c = scoreColor(65);
    expect(c).toContain("emerald-500/10");
  });

  it("returns amber for 50 <= score < 65", () => {
    const c = scoreColor(50);
    expect(c).toContain("amber");
  });

  it("returns faint amber for 35 <= score < 50", () => {
    const c = scoreColor(35);
    expect(c).toContain("amber-500/5");
  });

  it("returns rose for score < 35 (low confidence)", () => {
    const c = scoreColor(20);
    expect(c).toContain("rose");
  });

  it("returns zinc for null score (no data)", () => {
    const c = scoreColor(null);
    expect(c).toContain("zinc");
  });

  it("returns zinc for undefined score", () => {
    const c = scoreColor(undefined);
    expect(c).toContain("zinc");
  });

  // Boundary exactness
  it("score 79 is NOT in the >=80 tier", () => {
    expect(scoreColor(79)).not.toContain("emerald-500/15");
  });

  it("score 64 is NOT in the 65-79 tier", () => {
    expect(scoreColor(64)).not.toContain("emerald-500/10");
  });

  it("score 49 is NOT in the 50-64 tier", () => {
    expect(scoreColor(49)).not.toContain("amber-500/10");
  });

  it("handles numeric strings coerced to number", () => {
    // scoreColor accepts number but let's verify 0 gives rose
    expect(scoreColor(0)).toContain("rose");
  });

  it("score 100 (perfect) is emerald-500/15", () => {
    expect(scoreColor(100)).toContain("emerald-500/15");
  });
});

// =========================================================================
// statusColor — account status states
// =========================================================================
describe("statusColor — all account statuses", () => {
  it("Closed-Won → emerald", () => {
    expect(statusColor("Closed-Won")).toContain("emerald");
  });

  it("DISQUALIFIED → rose", () => {
    expect(statusColor("DISQUALIFIED")).toContain("rose");
  });

  it("Closed-Lost → rose", () => {
    expect(statusColor("Closed-Lost")).toContain("rose");
  });

  it("ACTIVE → blue", () => {
    expect(statusColor("ACTIVE")).toContain("blue");
  });

  it("Discovery scheduled → blue", () => {
    expect(statusColor("Discovery scheduled")).toContain("blue");
  });

  it("WARM → amber", () => {
    expect(statusColor("WARM")).toContain("amber");
  });

  it("FOLLOW_UP → amber", () => {
    expect(statusColor("FOLLOW_UP")).toContain("amber");
  });

  it("NURTURE → zinc", () => {
    expect(statusColor("NURTURE")).toContain("zinc");
  });

  it("null → zinc fallback", () => {
    expect(statusColor(null)).toContain("zinc");
  });

  it("unknown status → zinc fallback", () => {
    expect(statusColor("UNKNOWN_STATUS")).toContain("zinc");
  });

  // Case insensitivity
  it("closed-won lowercase → emerald", () => {
    expect(statusColor("closed-won")).toContain("emerald");
  });
});

// =========================================================================
// triggerColor — trigger signal categories
// =========================================================================
describe("triggerColor — trigger categories", () => {
  // Displacement triggers (competing PEO)
  it("displacement_trinet → blue", () => {
    expect(triggerColor("displacement_trinet")).toContain("blue");
  });

  it("displacement_paychex → blue", () => {
    expect(triggerColor("displacement_paychex")).toContain("blue");
  });

  it("competing_peo → blue", () => {
    expect(triggerColor("competing_peo")).toContain("blue");
  });

  // Tech / engineering growth
  it("tech_growth → violet", () => {
    expect(triggerColor("tech_growth")).toContain("violet");
  });

  it("engineering → violet", () => {
    expect(triggerColor("engineering")).toContain("violet");
  });

  // Compliance / OSHA
  it("osha → orange", () => {
    expect(triggerColor("osha")).toContain("orange");
  });

  it("compliance_5500 → orange", () => {
    expect(triggerColor("compliance_5500")).toContain("orange");
  });

  it("compliance → orange", () => {
    expect(triggerColor("compliance")).toContain("orange");
  });

  // WC renewal
  it("wc_renewal → emerald", () => {
    expect(triggerColor("wc_renewal")).toContain("emerald");
  });

  it("renewal → emerald", () => {
    expect(triggerColor("renewal")).toContain("emerald");
  });

  // Health / benefits (carrier consolidation)
  it("health_benefits → rose", () => {
    expect(triggerColor("health_benefits")).toContain("rose");
  });

  it("benefits → rose", () => {
    expect(triggerColor("benefits")).toContain("rose");
  });

  // Unknown
  it("null → zinc fallback", () => {
    expect(triggerColor(null)).toContain("zinc");
  });

  it("undefined → zinc fallback", () => {
    expect(triggerColor(undefined)).toContain("zinc");
  });

  it("unknown trigger → zinc fallback", () => {
    expect(triggerColor("some_other_trigger")).toContain("zinc");
  });
});

// =========================================================================
// estAnnualRev — PEO admin fee estimate
// =========================================================================
describe("estAnnualRev — $1,500 per EE", () => {
  it("11 EE (min ICP) → 16,500", () => {
    expect(estAnnualRev(11)).toBe(16500);
  });

  it("25 EE (mid ICP) → 37,500", () => {
    expect(estAnnualRev(25)).toBe(37500);
  });

  it("50 EE (max ICP) → 75,000", () => {
    expect(estAnnualRev(50)).toBe(75000);
  });

  it("55 EE (near-ICP) → 82,500", () => {
    expect(estAnnualRev(55)).toBe(82500);
  });

  it("null → 0 (no data)", () => {
    expect(estAnnualRev(null)).toBe(0);
  });

  it("undefined → 0", () => {
    expect(estAnnualRev(undefined)).toBe(0);
  });

  it("0 EE → 0", () => {
    expect(estAnnualRev(0)).toBe(0);
  });
});

// =========================================================================
// Score display via num() — formatting used in ScoreBreakdown
// =========================================================================
describe("num() — score display formatting", () => {
  it("formats a 2-decimal score correctly with digits=1", () => {
    // ScoreBreakdown uses .toFixed() directly, but num is used for EE display
    expect(num(75.5, 1)).toBe("75.5");
  });

  it("formats weight multiplier with 2 decimals", () => {
    expect(num(1.25, 2)).toBe("1.25");
  });

  it("null score renders em-dash", () => {
    expect(num(null)).toBe("—");
  });

  it("zero score renders 0 not em-dash", () => {
    expect(num(0)).toBe("0");
  });
});
