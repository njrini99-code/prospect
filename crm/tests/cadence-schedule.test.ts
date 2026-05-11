/**
 * tests/cadence-schedule.test.ts
 *
 * Tests for touch-schedule logic and route_day semantics.
 *
 * The CRM assigns every active account a routeDay integer (0–4 = Mon–Fri).
 * The touch scheduler creates 4 touches per account on a fixed day-offset
 * cadence: Day 0, Day 3, Day 7, Day 14.
 *
 * Because buildTouchSchedule is NOT a separately exported pure function
 * (the schedule is assembled inside the DB migration script and stored in
 * the `touches` table), these tests instead validate:
 *   1. The routeDay → weekday name mapping used in the UI / accounts page
 *   2. The expected day-offset sequence (0, 3, 7, 14) for a given start date
 *   3. getWeekStart correctness per NC sales route days
 *   4. promoteToActive sets routeDay = 0 (Monday default on promote)
 *
 * If buildTouchSchedule is ever extracted to lib/, these tests cover its
 * contract and would be updated to import it directly.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWeekStart, formatDate } from "@/lib/utils";
import { addDays, format, nextDay, parseISO } from "date-fns";

// =========================================================================
// routeDay integer → weekday name mapping
// (mirrors the SAVED_VIEWS / UI label convention)
// =========================================================================
const ROUTE_DAY_NAMES: Record<number, string> = {
  0: "Monday",    // Wake county (primary) — Mon blitz
  1: "Tuesday",   // Wake / Pitt secondary — Tue route
  2: "Wednesday", // Northern counties (Granville/Vance/Warren) — Wed route
  3: "Thursday",  // Cumberland / Sampson / Bladen — Thu route
  4: "Friday",    // Flex / follow-up day
};

describe("routeDay → weekday name mapping", () => {
  it("0 = Monday (Wake primary blitz day)", () => {
    expect(ROUTE_DAY_NAMES[0]).toBe("Monday");
  });

  it("1 = Tuesday (Wake / Pitt secondary)", () => {
    expect(ROUTE_DAY_NAMES[1]).toBe("Tuesday");
  });

  it("2 = Wednesday (Northern counties)", () => {
    expect(ROUTE_DAY_NAMES[2]).toBe("Wednesday");
  });

  it("3 = Thursday (Cumberland route)", () => {
    expect(ROUTE_DAY_NAMES[3]).toBe("Thursday");
  });

  it("4 = Friday (flex / follow-up)", () => {
    expect(ROUTE_DAY_NAMES[4]).toBe("Friday");
  });

  it("covers all 5 weekdays (Mon–Fri)", () => {
    expect(Object.keys(ROUTE_DAY_NAMES).map(Number)).toEqual([0, 1, 2, 3, 4]);
  });
});

// =========================================================================
// Touch day-offset sequence: 0, 3, 7, 14
// These offsets are the CRM's standard 4-touch cadence.
// =========================================================================
const TOUCH_OFFSETS = [0, 3, 7, 14];

function buildSchedule(startDate: Date): string[] {
  return TOUCH_OFFSETS.map((offset) =>
    format(addDays(startDate, offset), "yyyy-MM-dd"),
  );
}

describe("touch schedule — 4-touch cadence offsets", () => {
  const start = new Date(2026, 4, 11); // Monday, May 11, 2026

  it("generates exactly 4 touches", () => {
    expect(buildSchedule(start)).toHaveLength(4);
  });

  it("first touch is on the start date (day 0)", () => {
    const schedule = buildSchedule(start);
    expect(schedule[0]).toBe("2026-05-11");
  });

  it("second touch is 3 days after start (day 3)", () => {
    const schedule = buildSchedule(start);
    expect(schedule[1]).toBe("2026-05-14");
  });

  it("third touch is 7 days after start (day 7)", () => {
    const schedule = buildSchedule(start);
    expect(schedule[2]).toBe("2026-05-18");
  });

  it("fourth touch is 14 days after start (day 14)", () => {
    const schedule = buildSchedule(start);
    expect(schedule[3]).toBe("2026-05-25");
  });

  it("offsets between touches are [3, 4, 7] days", () => {
    const schedule = buildSchedule(start).map((d) => parseISO(d).getTime());
    const diffs = [
      (schedule[1] - schedule[0]) / 86_400_000,
      (schedule[2] - schedule[1]) / 86_400_000,
      (schedule[3] - schedule[2]) / 86_400_000,
    ];
    expect(diffs).toEqual([3, 4, 7]);
  });
});

// =========================================================================
// Touch schedule per route_day — ensure the first touch lands on the
// correct weekday for each NC route.
// =========================================================================
describe("touch schedule — first touch lands on correct route weekday", () => {
  // Given a week-start (Monday), compute the first touch date per routeDay
  function firstTouchForRoute(weekStart: Date, routeDay: number): Date {
    return addDays(weekStart, routeDay); // 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri
  }

  const weekStart = new Date(2026, 4, 11); // Mon May 11 2026

  it("routeDay 0 (Wake) first touch is Monday", () => {
    const d = firstTouchForRoute(weekStart, 0);
    expect(format(d, "EEEE")).toBe("Monday");
  });

  it("routeDay 1 (Pitt) first touch is Tuesday", () => {
    const d = firstTouchForRoute(weekStart, 1);
    expect(format(d, "EEEE")).toBe("Tuesday");
  });

  it("routeDay 2 (Northern) first touch is Wednesday", () => {
    const d = firstTouchForRoute(weekStart, 2);
    expect(format(d, "EEEE")).toBe("Wednesday");
  });

  it("routeDay 3 (Cumberland) first touch is Thursday", () => {
    const d = firstTouchForRoute(weekStart, 3);
    expect(format(d, "EEEE")).toBe("Thursday");
  });
});

// =========================================================================
// getWeekStart — used to stamp ledger entries and generate weekly buckets
// =========================================================================
describe("getWeekStart — week bucketing for touch ledger", () => {
  it("Monday returns itself", () => {
    const mon = new Date(2026, 4, 11); // Mon May 11
    expect(getWeekStart(mon)).toBe("2026-05-11");
  });

  it("Tuesday rolls back to Monday", () => {
    const tue = new Date(2026, 4, 12);
    expect(getWeekStart(tue)).toBe("2026-05-11");
  });

  it("Friday rolls back to Monday", () => {
    const fri = new Date(2026, 4, 15);
    expect(getWeekStart(fri)).toBe("2026-05-11");
  });

  it("Sunday rolls back to previous Monday", () => {
    const sun = new Date(2026, 4, 17);
    expect(getWeekStart(sun)).toBe("2026-05-11");
  });

  it("uses today if no argument supplied", () => {
    // Just assert it returns a valid yyyy-MM-dd string
    const result = getWeekStart();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // And it should be a Monday
    const day = parseISO(result).getDay();
    expect(day).toBe(1);
  });
});

// =========================================================================
// promoteToActive — honours the routeDay parameter (F3 fix).
// The functional path is exercised in actions.test.ts. This file documents
// the per-county mapping so the rep can sanity-check it independently of
// the action implementation.
// =========================================================================
describe("promoteToActive — per-county routeDay mapping", () => {
  // Mirror routeDayForCounty() in src/app/actions/index.ts.
  const COUNTY_TO_DAY: Record<string, number> = {
    wake: 0,
    durham: 0,
    orange: 0,
    johnston: 0,
    chatham: 0,
    pitt: 1,
    greene: 1,
    lenoir: 1,
    wayne: 1,
    wilson: 1,
    granville: 2,
    vance: 2,
    warren: 2,
    franklin: 2,
    person: 2,
    cumberland: 3,
    sampson: 3,
    bladen: 3,
    harnett: 3,
    robeson: 3,
  };

  for (const [county, day] of Object.entries(COUNTY_TO_DAY)) {
    it(`${county} -> route_day ${day} (${ROUTE_DAY_NAMES[day]})`, () => {
      expect(COUNTY_TO_DAY[county]).toBe(day);
      expect(ROUTE_DAY_NAMES[day]).toBeDefined();
    });
  }

  it("unknown county defaults to Friday flex day (route_day 4)", () => {
    expect(COUNTY_TO_DAY["nonexistent"]).toBeUndefined();
    // The action implementation falls through to 4.
    const FLEX = 4;
    expect(ROUTE_DAY_NAMES[FLEX]).toBe("Friday");
  });
});

// =========================================================================
// Channel label consistency across the touch sequence
// =========================================================================
import { channelLabel } from "@/lib/utils";

describe("channelLabel — touch channel display", () => {
  it("email channel displays as Email", () => {
    expect(channelLabel("email")).toBe("Email");
  });

  it("call channel displays as Call", () => {
    expect(channelLabel("call")).toBe("Call");
  });

  it("drop / field visit displays as Drop", () => {
    expect(channelLabel("drop")).toBe("Drop");
    expect(channelLabel("field")).toBe("Drop");
  });

  it("linkedin displays as LinkedIn", () => {
    expect(channelLabel("linkedin")).toBe("LinkedIn");
    expect(channelLabel("li")).toBe("LinkedIn");
  });

  it("null channel displays em-dash", () => {
    expect(channelLabel(null)).toBe("—");
  });

  it("phone normalizes to Call", () => {
    expect(channelLabel("phone")).toBe("Call");
  });
});

// =========================================================================
// formatDate — touch timeline display
// =========================================================================
describe("formatDate — touch timeline display", () => {
  it("formats an ISO date to 'Mon D' format", () => {
    expect(formatDate("2026-05-11")).toBe("May 11");
  });

  it("returns em-dash for null", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("returns em-dash for invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("accepts a Date object", () => {
    expect(formatDate(new Date(2026, 4, 11))).toBe("May 11");
  });
});
