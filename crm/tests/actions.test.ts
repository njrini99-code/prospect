/**
 * tests/actions.test.ts
 *
 * Unit tests for Server Actions in src/app/actions/index.ts.
 * The Drizzle `db` client, next/cache's `revalidatePath`, and the auth
 * helpers are mocked so no database connection is required.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- infrastructure mocks (must come before importing the module under test) ----

// Silence server-only guard (aliased in vitest.config.ts)
vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Auth helpers: requireAuth is the centrepiece for the new defence-in-depth
// pattern. We use vi.hoisted so the mock fns are available inside the
// factory (vi.mock factories run before the file body).
const auth = vi.hoisted(() => ({
  mockRequireAuth: vi.fn().mockResolvedValue(undefined as any),
  mockLogin: vi.fn(),
  mockLogout: vi.fn(),
  mockRateLimit: vi.fn().mockReturnValue({ ok: true }),
  mockClearRateLimit: vi.fn(),
  mockLoginIp: vi.fn().mockResolvedValue("127.0.0.1"),
}));
const {
  mockRequireAuth,
  mockLogin,
  mockLogout,
  mockRateLimit,
  mockClearRateLimit,
  mockLoginIp,
} = auth;

vi.mock("@/lib/auth", () => ({
  login: auth.mockLogin,
  logout: auth.mockLogout,
  isAuthenticated: vi.fn().mockResolvedValue(true),
  requireAuth: auth.mockRequireAuth,
  rateLimitLogin: auth.mockRateLimit,
  clearRateLimit: auth.mockClearRateLimit,
  loginIp: auth.mockLoginIp,
}));

// Drizzle db mock — chainable + awaitable
vi.mock("@/db/client", () => {
  function makeChain(resolveValue: unknown) {
    const chain: Record<string, unknown> = {};
    const METHODS = [
      "select", "from", "where", "limit", "orderBy",
      "insert", "into", "values", "update", "set",
      "leftJoin", "innerJoin", "execute", "offset",
      "delete", "onConflictDoNothing",
    ];
    for (const m of METHODS) {
      chain[m] = () => chain;
    }
    Object.defineProperty(chain, "then", {
      get() {
        return (resolve: (v: unknown) => void) => resolve(resolveValue);
      },
    });
    return chain;
  }
  const db = {
    select: () => makeChain([]),
    insert: () => makeChain(undefined),
    update: () => makeChain(undefined),
    delete: () => makeChain(undefined),
    execute: () => Promise.resolve({ rows: [] }),
  };
  return { db };
});

// ---- import actions AFTER mocks are set up ----
import {
  logOutcome,
  addNote,
  addTask,
  toggleTask,
  disqualifyAccount,
  promoteToActive,
  moveMeddpiccStage,
  updateMeddpicc,
  loginAction,
  logoutAction,
} from "@/app/actions/index";
import {
  routeDayForCounty,
  buildTouchSchedule,
  KILL_OUTCOMES,
  NURTURE_OUTCOMES,
} from "@/lib/cadence";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(undefined);
  mockRateLimit.mockReturnValue({ ok: true });
});

// =========================================================================
// logOutcome — input validation
// =========================================================================
describe("logOutcome — input validation", () => {
  it("throws ZodError when companyKey is missing", async () => {
    await expect(
      logOutcome({ companyKey: "", channel: "call", outcome: "vm" }),
    ).rejects.toThrow();
  });

  it("throws ZodError when channel is missing", async () => {
    await expect(
      logOutcome({ companyKey: "acme_llc", channel: "", outcome: "vm" }),
    ).rejects.toThrow();
  });

  it("throws ZodError when outcome is missing", async () => {
    await expect(
      logOutcome({ companyKey: "acme_llc", channel: "call", outcome: "" }),
    ).rejects.toThrow();
  });
});

// =========================================================================
// logOutcome — happy path (no touchId)
// =========================================================================
describe("logOutcome — happy path without touchId", () => {
  it("returns { ok: true } and revalidates /today", async () => {
    const result = await logOutcome({
      companyKey: "acme_llc",
      channel: "call",
      outcome: "vm",
    });
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });

  it("revalidates /accounts and /dashboard", async () => {
    await logOutcome({
      companyKey: "acme_llc",
      channel: "call",
      outcome: "interested",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard");
  });

  it("revalidates the account-specific path", async () => {
    await logOutcome({
      companyKey: "acme_llc",
      channel: "email",
      outcome: "opened",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/acme_llc");
  });
});

// =========================================================================
// logOutcome — optional fields
// =========================================================================
describe("logOutcome — optional fields", () => {
  it("accepts brokerCaptured", async () => {
    const result = await logOutcome({
      companyKey: "test_co",
      channel: "drop",
      outcome: "interested",
      brokerCaptured: "Hiscox",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts notes", async () => {
    const result = await logOutcome({
      companyKey: "test_co",
      channel: "call",
      outcome: "vm",
      notes: "No answer, try Thursday",
    });
    expect(result).toEqual({ ok: true });
  });

  it("accepts touchId", async () => {
    const result = await logOutcome({
      touchId: 42,
      companyKey: "test_co",
      channel: "call",
      outcome: "callback",
    });
    expect(result).toEqual({ ok: true });
  });
});

// =========================================================================
// logOutcome — cadence/meddpicc transitions (F1, F2)
// =========================================================================
describe("logOutcome — outcome transition rules", () => {
  it("KILL_OUTCOMES contains the expected closed-loop outcomes", () => {
    expect(KILL_OUTCOMES.has("not_interested")).toBe(true);
    expect(KILL_OUTCOMES.has("dnc")).toBe(true);
    expect(KILL_OUTCOMES.has("wrong_number")).toBe(true);
    expect(KILL_OUTCOMES.has("dead")).toBe(true);
    expect(KILL_OUTCOMES.has("acquired")).toBe(true);
    expect(KILL_OUTCOMES.has("disqualified")).toBe(true);
  });

  it("NURTURE_OUTCOMES contains the expected slow-roll outcomes", () => {
    expect(NURTURE_OUTCOMES.has("nurture_90d")).toBe(true);
    expect(NURTURE_OUTCOMES.has("meeting_cancelled")).toBe(true);
    expect(NURTURE_OUTCOMES.has("meeting_no_show")).toBe(true);
  });

  it("kill outcome resolves to ok:true (transitions side-effect on cadences)", async () => {
    const result = await logOutcome({
      companyKey: "acme_llc",
      channel: "call",
      outcome: "not_interested",
    });
    expect(result).toEqual({ ok: true });
  });

  it("nurture outcome resolves to ok:true (transitions cadence to NURTURE)", async () => {
    const result = await logOutcome({
      companyKey: "acme_llc",
      channel: "call",
      outcome: "nurture_90d",
    });
    expect(result).toEqual({ ok: true });
  });

  it("meeting_booked resolves to ok:true (upserts meddpicc row)", async () => {
    const result = await logOutcome({
      companyKey: "acme_llc",
      channel: "drop",
      outcome: "meeting_booked",
    });
    expect(result).toEqual({ ok: true });
    expect(revalidatePath).toHaveBeenCalledWith("/pipeline");
  });

  it("meeting_held resolves to ok:true (advances meddpicc stage)", async () => {
    const result = await logOutcome({
      companyKey: "acme_llc",
      channel: "drop",
      outcome: "meeting_held",
    });
    expect(result).toEqual({ ok: true });
  });
});

// =========================================================================
// requireAuth() guards every mutation
// =========================================================================
describe("requireAuth() is called on every Server Action", () => {
  it("logOutcome calls requireAuth", async () => {
    await logOutcome({ companyKey: "x", channel: "call", outcome: "vm" });
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("addNote calls requireAuth", async () => {
    await addNote({ companyKey: "x", body: "n" });
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("addTask calls requireAuth", async () => {
    await addTask({ companyKey: "x", body: "t" });
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("toggleTask calls requireAuth", async () => {
    await toggleTask(1, true);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("disqualifyAccount calls requireAuth", async () => {
    await disqualifyAccount("x", "reason");
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("promoteToActive calls requireAuth", async () => {
    await promoteToActive("x", 0);
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("updateMeddpicc calls requireAuth", async () => {
    await updateMeddpicc("x", "stage", "discovery_scheduled");
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("moveMeddpiccStage calls requireAuth", async () => {
    await moveMeddpiccStage("x", "discovery_scheduled");
    expect(mockRequireAuth).toHaveBeenCalled();
  });

  it("logoutAction calls requireAuth", async () => {
    await logoutAction();
    expect(mockRequireAuth).toHaveBeenCalled();
  });
});

describe("requireAuth() rejection propagates", () => {
  it("addNote rethrows the requireAuth redirect", async () => {
    mockRequireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(addNote({ companyKey: "x", body: "n" })).rejects.toThrow(
      "NEXT_REDIRECT",
    );
  });
});

// =========================================================================
// addNote / addTask / toggleTask
// =========================================================================
describe("addNote", () => {
  it("returns { ok: true }", async () => {
    const result = await addNote({ companyKey: "acme_llc", body: "Good call" });
    expect(result).toEqual({ ok: true });
  });

  it("revalidates the account path", async () => {
    await addNote({ companyKey: "acme_llc", body: "Follow up" });
    expect(revalidatePath).toHaveBeenCalledWith("/accounts/acme_llc");
  });

  it("rejects empty body", async () => {
    await expect(addNote({ companyKey: "acme_llc", body: "" })).rejects.toThrow();
  });

  it("rejects empty companyKey", async () => {
    await expect(addNote({ companyKey: "", body: "Note" })).rejects.toThrow();
  });
});

describe("addTask", () => {
  it("returns { ok: true } without dueDate", async () => {
    const result = await addTask({
      companyKey: "acme_llc",
      body: "Send proposal",
    });
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: true } with dueDate", async () => {
    const result = await addTask({
      companyKey: "acme_llc",
      body: "Follow up",
      dueDate: "2026-06-01",
    });
    expect(result).toEqual({ ok: true });
  });

  it("rejects empty body", async () => {
    await expect(
      addTask({ companyKey: "acme_llc", body: "" }),
    ).rejects.toThrow();
  });
});

describe("toggleTask", () => {
  it("returns { ok: true } when marking done", async () => {
    const result = await toggleTask(7, true);
    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: true } when marking undone", async () => {
    const result = await toggleTask(7, false);
    expect(result).toEqual({ ok: true });
  });
});

// =========================================================================
// disqualifyAccount / promoteToActive
// =========================================================================
describe("disqualifyAccount", () => {
  it("returns { ok: true }", async () => {
    const result = await disqualifyAccount("acme_llc", "Wrong EE count");
    expect(result).toEqual({ ok: true });
  });

  it("revalidates /accounts", async () => {
    await disqualifyAccount("acme_llc", "Out of territory");
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
  });
});

describe("promoteToActive — honours routeDay parameter", () => {
  it("accepts an explicit routeDay", async () => {
    const result = await promoteToActive("acme_llc", 3);
    expect(result).toEqual({ ok: true });
  });

  it("works without an explicit routeDay (derives from county)", async () => {
    const result = await promoteToActive("acme_llc");
    expect(result).toEqual({ ok: true });
  });

  it("revalidates /accounts, /bench, /today", async () => {
    await promoteToActive("acme_llc", 0);
    expect(revalidatePath).toHaveBeenCalledWith("/accounts");
    expect(revalidatePath).toHaveBeenCalledWith("/bench");
    expect(revalidatePath).toHaveBeenCalledWith("/today");
  });
});

// =========================================================================
// routeDayForCounty / buildTouchSchedule
// =========================================================================
describe("routeDayForCounty", () => {
  it("Wake => Monday (0)", () => {
    expect(routeDayForCounty("Wake")).toBe(0);
  });
  it("Durham => Monday (0)", () => {
    expect(routeDayForCounty("Durham")).toBe(0);
  });
  it("Pitt => Tuesday (1)", () => {
    expect(routeDayForCounty("Pitt")).toBe(1);
  });
  it("Granville => Wednesday (2)", () => {
    expect(routeDayForCounty("Granville")).toBe(2);
  });
  it("Cumberland => Thursday (3)", () => {
    expect(routeDayForCounty("Cumberland")).toBe(3);
  });
  it("unknown / null => Friday (4) flex", () => {
    expect(routeDayForCounty(null)).toBe(4);
    expect(routeDayForCounty("Some Random County")).toBe(4);
  });
  it("is case-insensitive", () => {
    expect(routeDayForCounty("WAKE")).toBe(0);
    expect(routeDayForCounty("cumberland")).toBe(3);
  });
});

describe("buildTouchSchedule", () => {
  it("starts on the next occurrence of the routeDay weekday", () => {
    // Sunday 2026-05-10 -> Monday for routeDay 0
    const sched = buildTouchSchedule(new Date(2026, 4, 10), 0);
    expect(sched[0]).toBe("2026-05-11");
  });

  it("produces 4 offsets (0,3,7,14) from the route's first day", () => {
    const sched = buildTouchSchedule(new Date(2026, 4, 10), 0);
    expect(sched).toEqual([
      "2026-05-11", // Mon
      "2026-05-14", // Thu
      "2026-05-18", // Mon
      "2026-05-25", // Mon
    ]);
  });

  it("routeDay 3 (Cumberland/Thu) sets first touch to Thursday", () => {
    const sched = buildTouchSchedule(new Date(2026, 4, 10), 3);
    expect(sched[0]).toBe("2026-05-14");
  });
});

// =========================================================================
// moveMeddpiccStage — transition matrix
// =========================================================================
describe("moveMeddpiccStage — transition matrix", () => {
  it("permits seeding into discovery_scheduled when no row exists", async () => {
    const r = await moveMeddpiccStage("acme_llc", "discovery_scheduled");
    expect(r).toEqual({ ok: true });
  });

  it("permits seeding into nurture when no row exists", async () => {
    const r = await moveMeddpiccStage("acme_llc", "nurture");
    expect(r).toEqual({ ok: true });
  });

  it("rejects seeding into closed_won (no prior row)", async () => {
    const r = await moveMeddpiccStage("acme_llc", "closed_won");
    expect(r).toEqual({
      ok: false,
      error: expect.stringContaining("cannot seed"),
    });
  });

  it("rejects unknown stage labels", async () => {
    const r = await moveMeddpiccStage("acme_llc", "bogus_stage");
    expect(r).toEqual({
      ok: false,
      error: expect.stringContaining("invalid stage"),
    });
  });
});

// =========================================================================
// updateMeddpicc — field allowlist enforcement
// =========================================================================
describe("updateMeddpicc — field validation", () => {
  it("rejects an unknown field name", async () => {
    await expect(
      updateMeddpicc("acme_llc", "notAField" as any, "value"),
    ).rejects.toThrow("invalid field");
  });

  it("accepts all valid MEDDPICC fields", async () => {
    const validFields = [
      "stage",
      "mMetrics",
      "eEconBuyer",
      "d1DecisionCriteria",
      "d2DecisionProcess",
      "pPaperProcess",
      "iPain",
      "cChampion",
      "cmpCompetition",
      "nextAction",
    ] as const;
    for (const field of validFields) {
      const result = await updateMeddpicc("acme_llc", field, "test value");
      expect(result).toEqual({ ok: true });
    }
  });
});

// =========================================================================
// loginAction — uses rate limiter
// =========================================================================
describe("loginAction — rate limiter integration", () => {
  it("returns lockout error when rate limit is exceeded", async () => {
    mockRateLimit.mockReturnValueOnce({ ok: false, retryInMs: 60_000 });
    const fd = new FormData();
    fd.set("password", "anything");
    const result = await loginAction(null, fd);
    expect(result).toMatchObject({
      ok: false,
      error: expect.stringContaining("Too many attempts"),
    });
  });

  it("returns 'Password required' on empty password", async () => {
    const fd = new FormData();
    fd.set("password", "");
    const result = await loginAction(null, fd);
    expect(result).toMatchObject({ error: "Password required" });
  });

  it("returns 'Incorrect password' when auth.login() returns false", async () => {
    mockLogin.mockResolvedValueOnce(false);
    const fd = new FormData();
    fd.set("password", "wrongpassword");
    const result = await loginAction(null, fd);
    expect(result).toMatchObject({ error: "Incorrect password" });
  });

  it("on success: clears rate limit and redirects to /today", async () => {
    mockLogin.mockResolvedValueOnce(true);
    const fd = new FormData();
    fd.set("password", "adppeo2026");
    await loginAction(null, fd);
    expect(mockClearRateLimit).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/today");
  });
});

// =========================================================================
// logoutAction
// =========================================================================
describe("logoutAction", () => {
  it("calls authLogout and redirects to /login", async () => {
    await logoutAction();
    expect(mockLogout).toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
