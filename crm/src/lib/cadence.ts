import { addDays, format } from "date-fns";

/**
 * Pure helpers for touch cadence + route_day routing.
 * Extracted from src/app/actions/index.ts because "use server" files
 * cannot export sync functions.
 */

/**
 * County -> route_day mapping (mirrors scripts/build_sales_os.py).
 *  - Wake / Durham / Orange / Johnston / Chatham => Mon (0)
 *  - Pitt / Greene / Lenoir / Wayne / Wilson => Tue (1)
 *  - Granville / Vance / Warren / Franklin / Person => Wed (2)
 *  - Cumberland / Sampson / Bladen / Harnett / Robeson => Thu (3)
 *  - everything else => Fri (4) flex day
 */
export function routeDayForCounty(
  county: string | null | undefined,
): number {
  if (!county) return 4;
  const c = county.toLowerCase().trim();
  if (
    c === "wake" ||
    c === "durham" ||
    c === "orange" ||
    c === "johnston" ||
    c === "chatham"
  )
    return 0;
  if (
    c === "pitt" ||
    c === "greene" ||
    c === "lenoir" ||
    c === "wayne" ||
    c === "wilson"
  )
    return 1;
  if (
    c === "granville" ||
    c === "vance" ||
    c === "warren" ||
    c === "franklin" ||
    c === "person"
  )
    return 2;
  if (
    c === "cumberland" ||
    c === "sampson" ||
    c === "bladen" ||
    c === "harnett" ||
    c === "robeson"
  )
    return 3;
  return 4;
}

/**
 * Build the canonical 4-touch schedule (offsets 0, 3, 7, 14) starting on
 * the next occurrence of `routeDay`.
 */
export function buildTouchSchedule(
  startDate: Date,
  routeDay: number,
): string[] {
  // JS getDay(): 0=Sun..6=Sat. Our routeDay: 0=Mon..4=Fri.
  // Convert: routeDay 0..4 -> jsDay 1..5
  const targetJsDay = routeDay + 1;
  const cur = new Date(startDate);
  while (cur.getDay() !== targetJsDay) {
    cur.setDate(cur.getDate() + 1);
  }
  const offsets = [0, 3, 7, 14];
  return offsets.map((o) => format(addDays(cur, o), "yyyy-MM-dd"));
}

// Kill / nurture outcome categorisation. These are plain Sets so they can
// be imported from anywhere (server actions, server components, tests).
export const KILL_OUTCOMES = new Set([
  "not_interested",
  "dnc",
  "wrong_number",
  "dead",
  "acquired",
  "disqualified",
]);

export const NURTURE_OUTCOMES = new Set([
  "nurture_90d",
  "meeting_cancelled",
  "meeting_no_show",
]);
