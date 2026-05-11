/**
 * tests/auth-ratelimit.test.ts
 *
 * Tests for the rewritten auth helpers in src/lib/auth.ts:
 *   - bcrypt-based login()
 *   - in-memory session id Set
 *   - rateLimitLogin() per-IP bucket (5 attempts / 5 min)
 *   - isAuthenticated() + logout()
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";

// ---- mock next/headers so cookies()/headers() don't require a request context ----
const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

const mockHeaderStore = {
  get: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
  headers: vi.fn(() => Promise.resolve(mockHeaderStore)),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

// Import after mocks
import {
  login,
  logout,
  isAuthenticated,
  rateLimitLogin,
  clearRateLimit,
  loginIp,
  _resetSessionsForTest,
  _hasSession,
  _resetRateLimitForTest,
} from "@/lib/auth";

const ORIG_ENV = process.env.APP_PASSWORD;

beforeEach(() => {
  vi.clearAllMocks();
  _resetSessionsForTest();
  _resetRateLimitForTest();
});

afterEach(() => {
  if (ORIG_ENV === undefined) {
    delete process.env.APP_PASSWORD;
  } else {
    process.env.APP_PASSWORD = ORIG_ENV;
  }
});

// =========================================================================
// login() — no APP_PASSWORD set
// =========================================================================
describe("login() when APP_PASSWORD is not set", () => {
  it("returns false", async () => {
    delete process.env.APP_PASSWORD;
    const result = await login("anypassword");
    expect(result).toBe(false);
  });

  it("does NOT call cookies().set", async () => {
    delete process.env.APP_PASSWORD;
    await login("anypassword");
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });
});

// =========================================================================
// login() — wrong password
// =========================================================================
describe("login() with wrong password", () => {
  it("returns false", async () => {
    process.env.APP_PASSWORD = "correctpassword";
    expect(await login("wrongpassword")).toBe(false);
  });

  it("does NOT call cookies().set", async () => {
    process.env.APP_PASSWORD = "correctpassword";
    await login("wrongpassword");
    expect(mockCookieStore.set).not.toHaveBeenCalled();
  });
});

// =========================================================================
// login() — correct password
// =========================================================================
describe("login() with correct password", () => {
  it("returns true", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    expect(await login("adppeo2026")).toBe(true);
  });

  it("sets the sos_session cookie with a 64-char hex id", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    await login("adppeo2026");
    expect(mockCookieStore.set).toHaveBeenCalledOnce();
    const [cookieName, value, opts] = mockCookieStore.set.mock.calls[0];
    expect(cookieName).toBe("sos_session");
    expect(typeof value).toBe("string");
    expect(value).toMatch(/^[0-9a-f]{64}$/);
    expect(opts).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    });
    expect(opts.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it("registers the new session id in the in-memory Set", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    await login("adppeo2026");
    const [, value] = mockCookieStore.set.mock.calls[0];
    expect(_hasSession(value)).toBe(true);
  });

  it("mints a different session id on each successful login", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    await login("adppeo2026");
    await login("adppeo2026");
    const first = mockCookieStore.set.mock.calls[0][1];
    const second = mockCookieStore.set.mock.calls[1][1];
    expect(first).not.toBe(second);
  });
});

// =========================================================================
// isAuthenticated()
// =========================================================================
describe("isAuthenticated()", () => {
  it("returns false when no cookie is present", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    expect(await isAuthenticated()).toBe(false);
  });

  it("returns false when cookie value is not in the session set", async () => {
    mockCookieStore.get.mockReturnValue({ value: "not-a-real-session" });
    expect(await isAuthenticated()).toBe(false);
  });

  it("returns true when cookie matches a registered session id", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    await login("adppeo2026");
    const [, value] = mockCookieStore.set.mock.calls[0];
    mockCookieStore.get.mockReturnValue({ value });
    expect(await isAuthenticated()).toBe(true);
  });
});

// =========================================================================
// logout()
// =========================================================================
describe("logout()", () => {
  it("removes the session id from the in-memory Set and deletes the cookie", async () => {
    process.env.APP_PASSWORD = "adppeo2026";
    await login("adppeo2026");
    const [, sessionId] = mockCookieStore.set.mock.calls[0];
    expect(_hasSession(sessionId)).toBe(true);

    mockCookieStore.get.mockReturnValue({ value: sessionId });
    await logout();
    expect(_hasSession(sessionId)).toBe(false);
    expect(mockCookieStore.delete).toHaveBeenCalledWith("sos_session");
  });
});

// =========================================================================
// rateLimitLogin() — 5 attempts / 5 min
// =========================================================================
describe("rateLimitLogin() — 5 attempts per 5-minute window", () => {
  it("allows the first 5 attempts", () => {
    for (let i = 0; i < 5; i++) {
      expect(rateLimitLogin("1.2.3.4")).toEqual({ ok: true });
    }
  });

  it("blocks the 6th attempt", () => {
    for (let i = 0; i < 5; i++) rateLimitLogin("1.2.3.4");
    const result = rateLimitLogin("1.2.3.4");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retryInMs).toBeGreaterThan(0);
      expect(result.retryInMs).toBeLessThanOrEqual(5 * 60 * 1000);
    }
  });

  it("keeps separate buckets per IP", () => {
    for (let i = 0; i < 5; i++) rateLimitLogin("1.1.1.1");
    expect(rateLimitLogin("1.1.1.1").ok).toBe(false);
    // A different IP starts fresh.
    expect(rateLimitLogin("2.2.2.2").ok).toBe(true);
  });

  it("clearRateLimit() resets the bucket for an IP", () => {
    for (let i = 0; i < 5; i++) rateLimitLogin("9.9.9.9");
    expect(rateLimitLogin("9.9.9.9").ok).toBe(false);
    clearRateLimit("9.9.9.9");
    expect(rateLimitLogin("9.9.9.9").ok).toBe(true);
  });

  it("resets after the 5-minute window elapses", () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 5; i++) rateLimitLogin("3.3.3.3");
      expect(rateLimitLogin("3.3.3.3").ok).toBe(false);
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);
      expect(rateLimitLogin("3.3.3.3").ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});

// =========================================================================
// loginIp() — extracts client IP from x-forwarded-for
// =========================================================================
describe("loginIp() — IP extraction from request headers", () => {
  it("uses x-forwarded-for first entry", async () => {
    mockHeaderStore.get.mockImplementation((name: string) =>
      name === "x-forwarded-for" ? "5.6.7.8, 10.0.0.1" : null,
    );
    expect(await loginIp()).toBe("5.6.7.8");
  });

  it("falls back to x-real-ip when x-forwarded-for is absent", async () => {
    mockHeaderStore.get.mockImplementation((name: string) =>
      name === "x-real-ip" ? "9.9.9.9" : null,
    );
    expect(await loginIp()).toBe("9.9.9.9");
  });

  it("returns 'unknown' when no IP headers are set", async () => {
    mockHeaderStore.get.mockReturnValue(null);
    expect(await loginIp()).toBe("unknown");
  });
});
