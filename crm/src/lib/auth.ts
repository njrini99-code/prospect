import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Single-user, local-only auth.
 *
 * - Password is hashed once at module load with bcrypt cost 10.
 * - Successful login mints a 32-byte hex session id which is stored in an
 *   in-memory Set. v1 limitation: sessions die on server restart (acceptable
 *   for a single-user, local-only CRM). v1.1+ would persist these to Postgres.
 * - Rate limiter is in-memory and per-IP: 5 attempts / 5 min window. Resets
 *   on a successful login. Lives in the same module so login() can clear it.
 */

const COOKIE_NAME = "sos_session";
const COOKIE_TTL = 60 * 60 * 24 * 30; // 30 days

// ---------- password hash (computed once on module load) ----------
function computeHash(): string | null {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return null;
  return bcrypt.hashSync(pw, 10);
}
// NOTE: lazy so tests can mutate process.env.APP_PASSWORD between cases.
let cachedHash: string | null | undefined;
let cachedHashSource: string | undefined;
function getHash(): string | null {
  const current = process.env.APP_PASSWORD;
  if (cachedHash === undefined || cachedHashSource !== current) {
    cachedHashSource = current;
    cachedHash = current ? bcrypt.hashSync(current, 10) : null;
  }
  return cachedHash;
}

// ---------- in-memory session store ----------
const SESSIONS = new Set<string>();

export function _resetSessionsForTest() {
  SESSIONS.clear();
}

export function _hasSession(id: string): boolean {
  return SESSIONS.has(id);
}

// ---------- rate limiter ----------
type RateBucket = { count: number; resetAt: number };
const RATE_LIMITS = new Map<string, RateBucket>();
const RATE_MAX = 5;
const RATE_WINDOW_MS = 5 * 60 * 1000;

export function _resetRateLimitForTest() {
  RATE_LIMITS.clear();
}

/**
 * Returns { ok: true } if the IP may attempt, or
 * { ok: false, retryInMs } if the bucket is exhausted.
 *
 * Counts the attempt as soon as it's checked. Caller is expected to
 * call clearRateLimit(ip) on a successful login.
 */
export function rateLimitLogin(ip: string): { ok: true } | { ok: false; retryInMs: number } {
  const now = Date.now();
  const bucket = RATE_LIMITS.get(ip);
  if (!bucket || bucket.resetAt <= now) {
    RATE_LIMITS.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_MAX) {
    return { ok: false, retryInMs: bucket.resetAt - now };
  }
  bucket.count += 1;
  return { ok: true };
}

export function clearRateLimit(ip: string) {
  RATE_LIMITS.delete(ip);
}

export async function loginIp(): Promise<string> {
  try {
    const h = await headers();
    const fwd = h.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]?.trim() || "unknown";
    const real = h.get("x-real-ip");
    if (real) return real.trim();
  } catch {
    // headers() throws outside a request context
  }
  return "unknown";
}

// ---------- session helpers ----------
function mintSessionId(): string {
  return randomBytes(32).toString("hex");
}

export async function isAuthenticated(): Promise<boolean> {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (!token) return false;
  return SESSIONS.has(token);
}

/**
 * Verifies the password against the bcrypt hash and, on success,
 * mints a new session id, persists it to the in-memory Set, and
 * sets the cookie. Returns true on success, false otherwise.
 *
 * IMPORTANT: bcrypt.compare is constant-time internally, so no
 * additional timingSafeEqual wrapping is required for the password
 * check itself. (The session-id lookup is a Set.has() check on
 * 32-byte random tokens; not amenable to timing attacks.)
 */
export async function login(password: string): Promise<boolean> {
  const hash = getHash();
  if (!hash) return false;
  const ok = await bcrypt.compare(password, hash);
  if (!ok) return false;
  const sessionId = mintSessionId();
  SESSIONS.add(sessionId);
  const c = await cookies();
  c.set(COOKIE_NAME, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_TTL,
  });
  return true;
}

export async function logout() {
  const c = await cookies();
  const token = c.get(COOKIE_NAME)?.value;
  if (token) SESSIONS.delete(token);
  c.delete(COOKIE_NAME);
}

export async function requireAuth(fromPath?: string) {
  if (!(await isAuthenticated())) {
    const target = fromPath
      ? `/login?from=${encodeURIComponent(fromPath)}`
      : "/login";
    redirect(target);
  }
}

/**
 * Legacy export kept ONLY so any orphan import doesn't break the build
 * during the transition. Returns a constant string; not used in auth flow.
 * @deprecated removed in v1.1 — sessions are random ids in an in-memory Set
 */
export function sessionTokenFor(_password: string): string {
  return "deprecated:base64-tokens-removed";
}
