/**
 * tests/queries.test.ts
 *
 * Verifies the CTE-driven kpiSnapshot() returns the agreed shape.
 * Drizzle's db client is mocked so no Neon round-trip happens.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// server-only is aliased in vitest.config.ts; double-mock here to be safe.
vi.mock("server-only", () => ({}));

const mockExecute = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    rows: [
      {
        touches_this_week: 12,
        touches_prev_week: 8,
        active_accounts: 41,
        meetings_booked: 2,
        conv_total: 50,
        conv_positive: 10,
        trend14d: [
          { date: "2026-04-28", n: 3 },
          { date: "2026-04-29", n: 5 },
          { date: "2026-04-30", n: 4 },
        ],
      },
    ],
  }),
);

vi.mock("@/db/client", () => ({
  db: {
    execute: mockExecute,
    select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
    insert: () => ({ values: () => Promise.resolve(undefined) }),
    update: () => ({ set: () => ({ where: () => Promise.resolve(undefined) }) }),
  },
}));

import { kpiSnapshot } from "@/lib/queries";

beforeEach(() => {
  mockExecute.mockClear();
});

describe("kpiSnapshot — CTE single-round-trip shape", () => {
  it("returns one Neon round-trip (db.execute called exactly once)", async () => {
    await kpiSnapshot();
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("returns the expected KPI keys (8 metrics)", async () => {
    const snap = await kpiSnapshot();
    expect(snap).toHaveProperty("touchesThisWeek");
    expect(snap).toHaveProperty("touchesPrevWeek");
    expect(snap).toHaveProperty("touchesTarget");
    expect(snap).toHaveProperty("activeAccounts");
    expect(snap).toHaveProperty("activeTarget");
    expect(snap).toHaveProperty("meetingsBooked");
    expect(snap).toHaveProperty("meetingsTarget");
    expect(snap).toHaveProperty("conversionPct");
    expect(snap).toHaveProperty("trend14d");
  });

  it("maps the conv columns to a percentage", async () => {
    const snap = await kpiSnapshot();
    // 10 / 50 = 20%
    expect(snap.conversionPct).toBeCloseTo(20);
  });

  it("returns 0 conversionPct when total is zero", async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [
        {
          touches_this_week: 0,
          touches_prev_week: 0,
          active_accounts: 0,
          meetings_booked: 0,
          conv_total: 0,
          conv_positive: 0,
          trend14d: [],
        },
      ],
    });
    const snap = await kpiSnapshot();
    expect(snap.conversionPct).toBe(0);
  });

  it("emits target numbers per the sales OS plan (45 / 50 / 3)", async () => {
    const snap = await kpiSnapshot();
    expect(snap.touchesTarget).toBe(45);
    expect(snap.activeTarget).toBe(50);
    expect(snap.meetingsTarget).toBe(3);
  });

  it("trend14d is a normalized {date, touches}[] sequence", async () => {
    const snap = await kpiSnapshot();
    expect(Array.isArray(snap.trend14d)).toBe(true);
    expect(snap.trend14d[0]).toEqual({ date: "2026-04-28", touches: 3 });
    expect(snap.trend14d[1]).toEqual({ date: "2026-04-29", touches: 5 });
  });
});
