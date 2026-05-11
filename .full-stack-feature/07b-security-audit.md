# 07b — Security Audit: ADP PEO CRM (Next.js 15, local-only v1)

**Scope:** `/Users/ricknini/Documents/ADP PEO/crm/` only. Python scripts under `/scripts/` and `/enrichment/` are out of scope.
**Posture under review:** single-user, local-dev-only (`localhost:3000`), Neon Postgres backend, env-password auth.
**Audit date:** 2026-05-11.
**Auditor:** security-auditor agent.

---

## Executive summary

15 distinct findings against the as-built code. The 03/05 architecture docs prescribed a hardened design (bcrypt + cost >= 10, in-memory session Set, IP rate-limit, transactions, `react-markdown` + `rehype-sanitize`); the as-built code does **none of those things**. What ships is materially weaker than documented.

Severity counts (calibrated for **local-only single-user** context — same findings on a public SaaS would be 2-3 tiers higher):

| Severity | Count |
|---|---|
| Critical | 2 |
| High     | 4 |
| Medium   | 5 |
| Low      | 2 |
| Info     | 2 |
| **Total**| **15** |

The two Critical findings (default password `adppeo2026` shipped in code/env + a real Neon connection string with credentials committed to `.env.local`) are deal-breakers if this code ever leaves Nick's laptop. For a strictly local-only `127.0.0.1:3000` dev server they are tolerable but should be remediated before any of: (a) `vercel deploy`, (b) `next start` bound to `0.0.0.0`, (c) git-push of `.env.local`.

**Ship-go / no-ship recommendation: see end of document.**

---

## Findings

| # | Sev | File:Line | Title |
|---|-----|-----------|-------|
| 1 | **Critical** | `src/lib/auth.ts:14,17-20` | Session "token" is `base64(APP_PASSWORD)` — not a session ID, and trivially reversible |
| 2 | **Critical** | `.env.local:1-2` + `.env.local.example:5` | Live Neon credentials in `.env.local`; weak default password `adppeo2026` in example |
| 3 | **High** | `src/app/actions/index.ts` (entire file) | Zero Server Actions call `requireAuth()` — all mutations are unauthenticated at the action layer |
| 4 | **High** | `src/lib/auth.ts:25` | Password comparison uses `!==` (not constant-time) |
| 5 | **High** | `package.json:47` (Next.js 15.0.3) + `npm audit` | 15 published advisories against Next.js 15.0.3 including 1 critical (RCE in React flight protocol), middleware auth bypass, SSRF, cache poisoning |
| 6 | **High** | `package.json:44` (drizzle-orm 0.36.4) | GHSA-gpj5-g38j-94v9 — SQL injection via improperly escaped identifiers in versions < 0.45.2 |
| 7 | **Medium** | `src/lib/auth.ts:7-15` + `src/middleware.ts:10` | No rate limiter on login despite 03-doc claim; documented in `tests/auth-ratelimit.test.ts` as a known gap |
| 8 | **Medium** | `src/middleware.ts:3,7` | `PUBLIC` allowlist matches with `startsWith(p)` — `/login-bypass`, `/api/healthcheck`, `/_nextfake` would all match |
| 9 | **Medium** | `src/middleware.ts:3` + missing file | Middleware allowlists `/api/health` but `src/app/api/health/route.ts` does not exist — broken contract; the documented health probe is unreachable |
| 10 | **Medium** | `src/lib/auth.ts:30` | `secure: process.env.NODE_ENV === "production"` — in dev (`next dev`) cookies are sent over plain HTTP; OK for `localhost` but a footgun if `next start` is ever exposed on LAN |
| 11 | **Medium** | `src/app/actions/index.ts:52-99` | No DB transactions wrapping multi-step mutations (touch update + ledger insert). neon-http does not support transactions; architecture doc claimed transactions were used |
| 12 | **Low** | `src/app/(app)/accounts/[id]/account-header.tsx:55-58` | `account.website` rendered into `href` without scheme allowlist — `javascript:`/`data:` URLs in DB would execute on click. Data is Python-controlled today, but the input boundary is implicit |
| 13 | **Low** | `next.config.mjs` (no security headers) | No CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy headers configured |
| 14 | **Info** | `.gitignore:6-7` | `.env*.local` is correctly gitignored; verify with `git check-ignore` before any push |
| 15 | **Info** | `03-architecture.md:288` vs `src/app/(app)/accounts/[id]/notes-panel.tsx:71-73` | Doc claims `react-markdown` + `rehype-sanitize`; actual implementation is plain-text rendering via JSX (`{n.body}`). Safer than documented — but the placeholder text "Markdown supported" misleads Nick |

---

## Detailed findings

### 1 — Critical — Trivially reversible "session token"

**File:** `src/lib/auth.ts:14, 17-20`

```ts
export function sessionTokenFor(password: string): string {
  // intentionally simple — single-user app, password from env
  return Buffer.from(password).toString("base64");
}
```

The cookie value `adp_peo_session` is just `base64(APP_PASSWORD)`. Anyone who reads the cookie via any client-side script injection sink (or shoulder-surfs DevTools, or has it logged anywhere) can `atob()` it and recover `APP_PASSWORD` in plain text. The "session" is not a session — it's an obfuscated copy of the password.

**Reproduction:** open DevTools → Application → Cookies → copy `adp_peo_session` value → `atob("YWRwcGVvMjAyNg==")` → `"adppeo2026"`.

**Why this exists:** the 03 doc spec'd `bcrypt.hash(APP_PASSWORD, 10)` and a 32-byte random session ID stored in an in-memory `Set`. The implementer skipped both.

**Fix:**
1. On server start, generate a process-wide cryptographically random session ID (`crypto.randomBytes(32).toString("hex")`) once per successful login; store the **set of valid IDs** in a module-scoped `Set<string>`.
2. The cookie value is the random ID, not derived from the password.
3. `isAuthenticated()` checks `validSessions.has(token)`, not equality with a derived value.
4. `logout()` removes the ID from the set in addition to deleting the cookie.

**Severity rationale (local-only):** Critical regardless — even on `localhost`, a single reflected-script-injection sink (none exist today, but the surface is one tag-soup library install away) recovers the master password. Downgraded one tier from "the world ends" because Nick is the only user and the attacker surface is his own browser.

---

### 2 — Critical — Default password + live credentials in env files

**Files:** `.env.local:1-2`, `.env.local.example:5`

```
DATABASE_URL=postgresql://neondb_owner:npg_Ud7s1GKtLBlC@ep-restless-snow-aq9wxrxa.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require
APP_PASSWORD=adppeo2026
```

```
# .env.local.example
APP_PASSWORD=changeme
```

Two problems:

a) **Default password `adppeo2026` is the actual production password** in `.env.local`. It is 10 chars, all-lowercase + digits, predictable (project name + year). bcrypt rainbow tables eat this for breakfast. Even though the local-only context blunts impact, this password is committed to Nick's memory and likely reused; treat as compromised.

b) **A real Neon Postgres URL with a real password (`npg_Ud7s1GKtLBlC`)** lives in `.env.local`. `.gitignore` covers it (verified in finding 14), but: (i) if Nick ever shares his laptop screen, the URL is in the dev tab, the settings page renders "set" for it, and a `process.env` printenv would leak it; (ii) `next dev` error overlays sometimes echo env in stack frames depending on which package threw — Next.js 15.0.3 had at least one CVE about exactly this.

**Reproduction:**
- `cat /Users/ricknini/Documents/ADP\ PEO/crm/.env.local`
- The Neon URL works against the public Neon HTTP endpoint. Anyone with this string has full read/write to the production DB.

**Fix:**
1. Rotate the Neon role password immediately (`npg_Ud7s1GKtLBlC` is now in audit logs).
2. Generate a real `APP_PASSWORD` (>= 24 random chars, e.g. `openssl rand -base64 24`). Store in a password manager.
3. Update `.env.local.example` to say `APP_PASSWORD=<generate with: openssl rand -base64 24>` rather than `changeme`.
4. Add a startup check that refuses to boot if `APP_PASSWORD === "changeme"` or `APP_PASSWORD.length < 16`.

**Severity rationale (local-only):** Critical anyway because the *Neon credential* in the file is a remote secret — its blast radius is not bounded by localhost. A laptop theft or accidental `git add -A` exposes the DB.

---

### 3 — High — No `requireAuth()` in Server Actions

**File:** `src/app/actions/index.ts` (entire file)

The 03 doc says every mutating Server Action must call `requireAuth()` first. Verified with `grep`:

```
$ grep -n "requireAuth\|isAuthenticated" src/app/actions/index.ts
(no matches)
```

`logOutcome`, `addNote`, `addTask`, `toggleTask`, `disqualifyAccount`, `promoteToActive`, `updateMeddpicc`, `moveMeddpiccStage`, `markTouchComplete` — **none of them check authentication**. They rely entirely on:

- Middleware blocking direct page navigation, and
- Next.js's built-in Server Action origin check + cryptographic action ID (CSRF protection).

The origin/action-ID check is real and meaningful, but it is **a single layer**. Authorization Bypass in Next.js Middleware (GHSA-f82v-jwr5-mffw, finding 5) is exactly the kind of bug this layering is meant to defend against. If middleware can be bypassed (and it has been, multiple times in 2024-2025 Next.js CVEs), every mutation is reachable by an unauthenticated caller.

**Reproduction:**
1. With middleware bypass (CVE-class), an attacker hits any Server Action via a forged form post with a valid action ID extracted from the public HTML of the action's RSC payload.
2. There is no second auth check on the server, so the DB write succeeds.

**Fix:** add `await requireAuth();` as the first line of every exported `async function` in `src/app/actions/index.ts`. The performance cost is one cookie read per call.

**Severity rationale (local-only):** High not Critical because middleware bypass is currently theoretical on `localhost:3000` from Nick's own browser. On a Vercel-deployed instance this would be Critical.

---

### 4 — High — Non-constant-time password compare

**File:** `src/lib/auth.ts:25`

```ts
if (password !== expected) return false;
```

`===` short-circuits on first byte mismatch. Over a network, the difference in reject latency between "first byte wrong" and "all but last byte right" is measurable. Even at `localhost` latency the timing channel is tiny but not zero; on Vercel edge it's exploitable.

**Fix:** use `crypto.timingSafeEqual(Buffer.from(password), Buffer.from(expected))` after length-equalizing the inputs (timingSafeEqual throws if lengths differ — handle that by padding or by a fixed-time length check).

Better fix: combine with finding 1 — store `bcrypt.hash(APP_PASSWORD, 12)` computed once at startup and compare with `bcrypt.compare(submitted, hash)`, which is intrinsically constant-time.

**Severity rationale (local-only):** High in principle; on `localhost` the practical exploitability is near-zero. Downgrade to Medium if you accept "local-only forever."

---

### 5 — High — Next.js 15.0.3 has 15 published advisories including 1 Critical RCE

**File:** `package.json:47`

```
"next": "15.0.3"
```

`npm audit --omit=dev` output (relevant entries):

```
next  9.3.4-canary.0 - 16.3.0-canary.5
Severity: critical
- Next.js Allows a Denial of Service (DoS) with Server Actions (GHSA-7m27-7ghc-44w9)
- Information exposure in Next.js dev server due to lack of origin verification (GHSA-3h52-269p-cp9r)
- Next.js Affected by Cache Key Confusion for Image Optimization API Routes (GHSA-g5qg-72qw-gw5v)
- Next.js Content Injection Vulnerability for Image Optimization (GHSA-xv57-4mr9-wg8v)
- Next.js Improper Middleware Redirect Handling Leads to SSRF (GHSA-4342-x723-ch2f)
- Next.js Race Condition to Cache Poisoning (GHSA-qpjv-v59x-3qc4)
- Next.js is vulnerable to RCE in React flight protocol (GHSA-9qr9-h5gf-34mp)  <-- CRITICAL
- Next Server Actions Source Code Exposure (GHSA-w37m-7fhw-fmv9)
- Next Vulnerable to Denial of Service with Server Components (GHSA-mwv6-3258-q52c)
- Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns (GHSA-9g9p-9gw9-jx7f)
- Next.js HTTP request deserialization can lead to DoS using insecure RSC (GHSA-h25m-26qc-wcjf)
- Authorization Bypass in Next.js Middleware (GHSA-f82v-jwr5-mffw)  <-- directly invalidates finding 3's only line of defense
- Next.js: HTTP request smuggling in rewrites (GHSA-ggv3-7p47-pfv8)
- Next.js: Unbounded next/image disk cache growth (GHSA-3x4c-7xq6-9pq8)
- Next.js has a Denial of Service with Server Components (GHSA-q4gf-8mx6-v5v3)
Fix: npm audit fix --force -> installs next@15.5.18
```

The critical one (GHSA-9qr9-h5gf-34mp) and the middleware-bypass one (GHSA-f82v-jwr5-mffw) are the load-bearing entries. Combined with finding 3 (no per-action auth) this is the most dangerous compound exposure in the app.

**Reproduction:** `cd crm && npm audit --omit=dev`.

**Fix:** upgrade to `next@15.5.18` or later. Run `npm audit fix --force` followed by a full `npm run test && npm run test:e2e` to catch breakage. Also upgrade `react@19.0.0-rc-66855b96-20241106` (a pinned RC) to the released `react@19.x` GA — RC pins are a maintenance liability.

**Severity rationale (local-only):** High. On `localhost` the RCE and SSRF vectors require crafted requests an attacker on Nick's machine could trivially mount (a malicious npm postinstall script in any package he installs, for instance). Not Critical because the network exposure surface is essentially zero on `127.0.0.1`.

---

### 6 — High — Drizzle 0.36.4 has known SQL-injection advisory

**File:** `package.json:44`

```
"drizzle-orm": "^0.36.4"
```

```
drizzle-orm  <0.45.2
Severity: high
SQL injection via improperly escaped SQL identifiers (GHSA-gpj5-g38j-94v9)
Fix: npm audit fix --force -> installs drizzle-orm@0.45.2 (breaking change)
```

The advisory is about identifier escaping (table/column names). This codebase **does not interpolate user input as identifiers** — every `sql\`...\`` in `src/lib/queries.ts` interpolates only static `${touches}`/`${cadences}` references plus parameterized `${value}` placeholders. So the *specific* injection vector in this advisory is not directly reachable from current code. But the dep is vulnerable and upgrade is one command.

**Fix:** `npm audit fix --force` (breaking — drizzle 0.45.x has rename/signature changes; budget ~1-2 hours to fix typecheck errors).

**Severity rationale (local-only):** High because the practice ("ignore advisories that don't *currently* hit you") is brittle. Downgrade is not appropriate.

---

### 7 — Medium — Login rate limiter not implemented

**File:** `src/lib/auth.ts:7-15`, `src/middleware.ts:10`

The 03 doc says:
> Rate-limit `/login` Server Action to 5 attempts per IP per 5 minutes (in-memory token bucket)

`grep -rn "rateLimit\|attempts" src/` returns nothing. The test file `tests/auth-ratelimit.test.ts:168-181` explicitly documents the gap:

```ts
describe("KNOWN GAP: auth rate limiter", () => {
  it("is NOT implemented — repeated wrong passwords always return false (no lockout)", ...
```

**Reproduction:** hit `/login` 1,000 times with `curl -X POST` — all 1,000 process; no lockout.

**Fix:** add a module-scoped `Map<ip, { count: number; resetAt: number }>` in `src/lib/auth.ts`. On `login()`:

```ts
const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim()
        ?? (await headers()).get("x-real-ip")
        ?? "unknown";
const now = Date.now();
const bucket = attempts.get(ip);
if (bucket && bucket.resetAt > now && bucket.count >= 5) {
  return false; // optionally throw a typed "rate-limited" sentinel
}
// ... do the compare ...
// on failure, bump count + set resetAt = now + 5*60*1000
// on success, attempts.delete(ip)
```

Caveats: (a) `x-forwarded-for` is spoofable behind nothing — on `localhost` there's no proxy so just use a single global bucket; (b) the memory map dies on `next dev` reload, which is acceptable for v1.

**Severity rationale (local-only):** Medium. A brute-force attacker against `127.0.0.1:3000` is already an attacker on Nick's machine. The fix is cheap so do it anyway.

---

### 8 — Medium — `startsWith` PUBLIC allowlist is over-permissive

**File:** `src/middleware.ts:3,7`

```ts
const PUBLIC = ["/login", "/favicon.ico", "/_next", "/api/health"];

if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p))) {
  return NextResponse.next();
}
```

The third disjunct (`pathname.startsWith(p)`) makes the first two redundant **and** opens up false-positive matches:

- `/loginbypass` matches `startsWith("/login")` -> bypasses auth
- `/_nextfake` matches `startsWith("/_next")` -> bypasses auth
- `/api/healthcheck-admin` matches `startsWith("/api/health")` -> bypasses auth

Since none of these routes exist in this codebase today, no live bypass is reachable. But if any future route is named with one of those prefixes, it leaks.

**Fix:** drop the third disjunct entirely:

```ts
if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
  return NextResponse.next();
}
```

**Severity rationale (local-only):** Medium because it's a footgun, not a current live bug.

---

### 9 — Medium — `/api/health` allowlisted in middleware but route handler doesn't exist

**File:** `src/middleware.ts:3` references `/api/health`; `src/app/api/` directory does not exist.

```
$ find /Users/ricknini/Documents/ADP\ PEO/crm/src/app -type d -name api
(no output)
```

The 03 doc and middleware both reference a public health probe; it was never built. Hitting `/api/health` today returns Next.js's default 404, which **is** unauthenticated (because of the allowlist), so an unauth user can fingerprint that the app is running and on what Next.js version (via the X-Powered-By header). The information leak is small.

The audit prompt asked: "Can an unauthenticated user hit `/api/pulse` or `/api/health` to enumerate state?" Neither route exists. There is no API surface at all in this app — all data flow goes through RSC + Server Actions, both of which require either auth or origin verification.

**Fix:** either (a) build the `/api/health` route as a tiny `route.ts` returning `{ ok: true }` after `SELECT 1`, or (b) remove `/api/health` from the PUBLIC list since nothing uses it. (b) is cheaper for v1.

**Severity rationale (local-only):** Medium for the docs/code drift; the actual exposure is Info.

---

### 10 — Medium — `Secure` cookie attribute only in production

**File:** `src/lib/auth.ts:30`

```ts
secure: process.env.NODE_ENV === "production",
```

In `next dev` (development), `Secure` is `false`. On `localhost` this is required (no HTTPS). But if Nick ever runs `next start` (production build, dev env) and binds to `0.0.0.0` to test from his phone over WiFi, the cookie travels in plaintext over LAN.

**Fix:** add an explicit comment near the cookie set documenting the LAN risk, and add a startup check that refuses to start a non-`NODE_ENV=production` server with `HOSTNAME` set to anything other than `127.0.0.1`/`localhost`. Or simpler: hard-code `secure: true` and use HTTPS-only via `mkcert` for dev.

**Severity rationale (local-only):** Medium; downgrades to Low if you commit to `localhost`-only forever (README explicitly says so, finding 14).

---

### 11 — Medium — No transactions wrapping multi-step mutations

**File:** `src/app/actions/index.ts:52-99` (`logOutcome` does an update + insert; no `db.transaction(...)`)

```ts
export async function logOutcome(input: ...) {
  // ...
  if (data.touchId) {
    await db.update(touches).set({ completed: true, outcome: data.outcome, ... }).where(...);
  }
  await db.insert(outcomesLedger).values({ ... });
  // ...
}
```

If the second write fails (network blip to Neon, transient constraint violation), the touch is marked complete with no ledger record — silent data corruption.

This isn't strictly a "security" finding (CIA-triangle: integrity), but auditors call it out because partial-write attacks against append-only ledgers are a real class of bug. The 03 doc claimed `db.transaction(async (tx) => { ... })` would be used; the code doesn't do it.

**Root cause:** the project uses `drizzle-orm/neon-http`, which **does not support transactions** (the HTTP driver makes one round trip per query). The architecture doc didn't notice this constraint.

**Fix options:**
1. Switch to `drizzle-orm/neon-serverless` (the WebSocket-based driver) which does support `tx.transaction(...)`.
2. Add a single composite Postgres function that does both writes atomically server-side, call via `db.execute(sql\`SELECT log_outcome(...)\`)`.
3. Accept the risk for v1 and add a Sunday-night reconciler in the Python orchestrator that flags touches.completed=true without a matching ledger row.

**Severity rationale (local-only):** Medium. Single-user app means the conflict surface is small. But this is the kind of bug Nick will lose data to and never know.

---

### 12 — Low — `account.website` rendered into `href` without scheme allowlist

**File:** `src/app/(app)/accounts/[id]/account-header.tsx:55-58`

```tsx
href={
  account.website.startsWith("http")
    ? account.website
    : `https://${account.website}`
}
```

If `account.website` in Postgres contains `javascript:alert(1)`, the check `startsWith("http")` returns false -> the code wraps it as `https://javascript:alert(1)` which is benign. If it contained `https://attacker.com`, that's fine. If it contained `http://...evil...`, also fine.

**Actual risk:** very low. The data is written by the Python orchestrator from Google Maps / Apollo scrapes — not user input through this CRM. But the "implicit trust boundary" makes me nervous because nothing in the CRM enforces it.

**Fix:**

```tsx
const href = (() => {
  try {
    const u = new URL(account.website.startsWith("http") ? account.website : `https://${account.website}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href;
  } catch { return null; }
})();
```

Render the `<a>` only if `href !== null`.

**Severity rationale (local-only):** Low; clickjack-via-stored-data needs an attacker who can write to Neon already.

---

### 13 — Low — No HTTP security headers

**File:** `next.config.mjs` (no `headers()` export)

No `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`. For a `localhost` dev app this matters less, but if/when Nick deploys to Vercel, defaults like `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: DENY` should be there from day one.

**Fix:**

```js
// next.config.mjs
const nextConfig = {
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        // CSP: start with report-only mode in dev; needs careful tuning for Tremor/Recharts inline styles
      ],
    }];
  },
  // ... rest
};
```

**Severity rationale (local-only):** Low; matters when deployed.

---

### 14 — Info — `.gitignore` correctly excludes env files

**File:** `.gitignore:6-7`

```
.env
.env.local
.env*.local
```

This is correct. Suggest verification before any future commit:

```bash
git check-ignore -v crm/.env.local
# should output: crm/.gitignore:7:.env*.local    crm/.env.local
```

The 03 doc decision-log row 327 calls this out as Critical-if-it-leaks. The mitigation is in place.

---

### 15 — Info — Notes are plain-text rendered, not markdown (safer than docs claim)

**Files:** `03-architecture.md:288` (claims `react-markdown` + `rehype-sanitize`) vs `src/app/(app)/accounts/[id]/notes-panel.tsx:71-73`:

```tsx
<div className="text-sm whitespace-pre-wrap leading-relaxed">
  {n.body}
</div>
```

React escapes by default; this is XSS-safe. The placeholder text on line 43 says "Markdown supported." — which is **false** in the current implementation; markdown is not parsed. Either:

- (a) Fix the placeholder to "Plain text — line breaks preserved." (1-minute fix), or
- (b) Actually wire `react-markdown` + `rehype-sanitize` per the doc, but then re-audit because the surface grows.

For v1, (a) is the right move.

---

## What I checked and did NOT find issues with

- **CSRF:** Server Actions get Next.js's built-in origin check + cryptographic action ID. Sufficient for v1.
- **SQL injection:** every `sql\`...\`` in `src/lib/queries.ts` uses Drizzle's tagged template, which parameterizes scalar values and inlines table references safely. The `${like}` template on line 32-34 is parameterized. The drizzle dep CVE (finding 6) is about identifier escaping, not what this code does.
- **Zod validation:** every Server Action input is `Schema.parse(input)` first. The schemas are permissive (`outcome: z.string().min(1)` rather than an enum), but no field is unvalidated.
- **DATABASE_URL leakage:** never `console.log`'d. The settings page renders `"set" | "missing"` not the value itself (finding 2 still stands because the URL lives in a file on disk).
- **Logging:** the only `console.error` is in `src/app/error.tsx:15` and it logs the `Error` object — no PII or secrets are included unless callers throw with them.
- **SSRF:** no `fetch`/`axios`/`http.get` anywhere in `src/` — the app does not make outbound HTTP requests at all. `mailto:` and `tel:` hrefs are browser-handled. Mapbox token (when set) would be used client-side via the JS SDK loaded directly in the browser, not via a server fetch.
- **`/api/pulse`:** does not exist. The "pulse rail" is rendered server-side from RSC.
- **Raw-HTML injection APIs / `innerHTML` / `eval`:** zero hits across the codebase. (React's escape-hatch HTML-insert prop is also absent.)
- **IDOR:** all `/accounts/[id]` reads happen inside the protected `(app)` group, gated by middleware + layout `requireAuth`. Single-user, so ownership doesn't apply.

---

## Defense-in-depth recommendations (nice-to-have for v1)

Not blockers for shipping but tightens the posture meaningfully:

1. **Bind dev server to `127.0.0.1`.** Edit `package.json` script: `"dev": "next dev -H 127.0.0.1"`. Prevents accidental LAN exposure.
2. **Add a `preinstall` lifecycle check** that warns on `npm audit` critical/high. Tiny shell wrapper.
3. **Use `mkcert` for local HTTPS.** Lets you set `secure: true` unconditionally on the cookie. ~5 min setup.
4. **Add a `/api/health` route handler.** If it's allowlisted in middleware, build it; it's useful for a "is Neon reachable" smoke test you can curl from a launchd job.
5. **Pin React off the RC.** `react@19.0.0-rc-66855b96-20241106` is a snapshot pin — upgrade to released `react@19.x` with the Next.js 15.5+ bump.
6. **Add a CSP in report-only mode.** Even one that just reports to `console` catches inline-script regressions.
7. **Document the bypass-the-CRM data path.** Anything that writes to Neon outside the CRM (the Python `sync_to_neon.py`) should sanitize URL-like fields before insert — write a one-time data audit query to find any existing row where `cadences.website LIKE 'javascript:%'` etc.
8. **Add `httpOnly` + `SameSite=Lax` test** to the test suite to lock in cookie hardening (currently only `httpOnly` is asserted in `auth-ratelimit.test.ts:127`).
9. **Replace base64 session with random ID + bcrypt password hash.** This is the single highest-leverage fix in this list; finding 1 will keep being a Critical until it lands.

---

## Ship-go / no-ship recommendation

**Conditional ship-go for `localhost:3000` single-user-only v1.**

Acceptable to use this app today if and only if all of the following hold:

- [ ] Dev server is bound to `127.0.0.1` (currently it defaults to `0.0.0.0` in `next dev`)
- [ ] `.env.local` is NOT committed (verify with `git check-ignore`)
- [ ] Nick is the only person on the machine and the laptop is not shared
- [ ] No `vercel deploy` until findings 1, 2, 3, 5, 6 are remediated
- [ ] No `next start` bound to a non-loopback interface

**No-ship until fixed if** any of the following becomes true:

- The app gets deployed to Vercel or any non-loopback host. Findings 1, 2, 3, 5 are all show-stoppers on a public URL.
- A second user (admin, contractor, anyone) needs access. The auth model assumes one user; multi-user requires a complete rewrite of the session layer.
- The Neon credential in finding 2 isn't rotated within 7 days.

**Minimum remediation to make this "ship-go without conditions":**

1. (Finding 1) Replace base64 session with `crypto.randomBytes(32).toString("hex")` + in-memory Set + bcrypt-hashed password compare. ~30 min.
2. (Finding 2) Rotate Neon password; pick a 24+ char `APP_PASSWORD`; add startup guard rejecting weak values. ~15 min.
3. (Finding 3) Add `await requireAuth()` to every Server Action. ~10 min mechanical edit.
4. (Finding 4) `crypto.timingSafeEqual` for password compare (covered by #1 if bcrypt is used). ~free.
5. (Findings 5, 6) `npm audit fix --force` followed by `npm test && npm run test:e2e`. ~1-2 hours including breakage repair.

Total estimated remediation: **half a day** to move from "conditional ship-go local-only" to "ship-go anywhere reasonable."

---

**Auditor sign-off:** issues 1-6 are non-negotiable before any non-loopback deployment. Issues 7-11 are real but tolerable for a strictly-local v1. Issues 12-15 are polish.

The architecture document (`03-architecture.md`) prescribed a substantially stronger design than what was implemented. The gap between "what the design says" and "what the code does" is itself a finding — call it Info-16: future contributors will read the doc, assume bcrypt + transactions + rate-limiting are present, and write code that relies on guarantees the actual codebase does not provide. Either bring the implementation up to the documented bar, or rewrite the doc to match reality. Don't leave them out of sync.
