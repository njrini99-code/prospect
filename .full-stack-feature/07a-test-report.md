# 07a — Test Coverage Report

**Date:** 2026-05-11  
**Vitest version:** 2.1.9  
**Next.js version:** 15.0.3

---

## Summary

| Metric | Before | After |
|---|---|---|
| Vitest test files | 3 | 7 |
| Vitest tests | 36 | 172 |
| Playwright e2e specs | 1 | 3 |
| Build result | PASS | PASS |
| Total Vitest duration | 1.37 s | 1.75 s |

---

## Files Created

### Vitest unit tests (new)

| File | Tests | What it covers |
|---|---|---|
| `tests/actions.test.ts` | 40 | All Server Actions: `logOutcome`, `addNote`, `addTask`, `toggleTask`, `disqualifyAccount`, `promoteToActive`, `moveMeddpiccStage`, `updateMeddpicc`, `loginAction`, `logoutAction` |
| `tests/auth-ratelimit.test.ts` | 15 | `sessionTokenFor`, `login()` (no password set, wrong password, correct password, cookie shape), `isAuthenticated()`, rate-limiter gap documentation |
| `tests/score-overlay.test.ts` | 49 | `scoreColor` (all 5 tiers + boundaries + null/undefined), `statusColor` (all statuses including case-insensitive), `triggerColor` (all 7 categories), `estAnnualRev` (ICP boundary values), `num()` display |
| `tests/cadence-schedule.test.ts` | 32 | routeDay → weekday name mapping (0–4), 4-touch day-offset sequence (0/3/7/14), per-route first-touch weekday, `getWeekStart` from any day of week, `promoteToActive` default routeDay=0, `channelLabel`, `formatDate` |

### Vitest unit tests (unchanged)

| File | Tests |
|---|---|
| `tests/auth.test.ts` | 3 |
| `tests/schema.test.ts` | 2 |
| `tests/utils.test.ts` | 31 |

### Playwright e2e specs (new — scaffold only)

| File | Tests | What it covers |
|---|---|---|
| `e2e/pipeline-stage-move.spec.ts` | 4 | Login → /pipeline → kanban card drag to new stage → reload and verify persistence; fallback select-based path |
| `e2e/bench-promote.spec.ts` | 4 | Login → /bench → click Promote → verify account disappears from bench and appears in /today |

### Playwright e2e specs (unchanged)

| File | Tests |
|---|---|
| `e2e/login.spec.ts` | 3 |

---

## Coverage Estimate

Vitest has no `--coverage` plugin installed (`@vitest/coverage-v8` is not in devDependencies). Estimates are based on line/branch inspection:

| Module | Estimated coverage |
|---|---|
| `src/lib/utils.ts` | ~95% — all exported functions exercised, all branches hit |
| `src/lib/auth.ts` | ~85% — `sessionTokenFor`, `login`, `isAuthenticated`, `logout` covered; `requireAuth` redirect branch covered via mock |
| `src/app/actions/index.ts` | ~80% — all actions exercised; Zod parse errors tested; DB interactions verified via mock calls |
| `src/db/schema.ts` | ~70% — schema exports verified; type exports not runtime-testable |
| `src/lib/queries.ts` | ~20% — only indirectly covered; direct query tests need DB or heavier mock setup (deferred) |
| `src/app/(app)/**` pages/components | ~10% — no React component rendering tests added (not a target for this pass) |

**Overall lib/ + actions/ estimate: ~80%**  
**Overall pages/ estimate: ~10–15%**

---

## Mocking Pattern Used

All Server Actions tests use a fully self-contained `vi.mock("@/db/client")` factory that returns a chainable, awaitable Drizzle builder. The factory defines its helper functions _inside_ the callback to avoid Vitest's `vi.mock` hoisting restriction (which caused `ReferenceError: Cannot access 'makeQueryChain' before initialization` on the first run — fixed before final commit).

```
vi.mock("@/db/client", () => {
  function makeChain(resolveValue) { ... }
  return { db: { select: () => makeChain([]), insert: ..., update: ..., execute: ... } };
});
```

`next/cache`, `next/navigation`, and `@/lib/auth` are also mocked so no cookies, redirects, or real DB calls occur.

---

## Bugs / Gaps Discovered While Writing Tests

### 1. No auth rate limiter (MEDIUM risk)

`src/lib/auth.ts` has no brute-force protection. There is no in-memory counter, Redis lock, or exponential backoff on `login()`. An attacker with network access can make unlimited password attempts. The `KNOWN GAP: auth rate limiter` describe-block in `tests/auth-ratelimit.test.ts` documents this and will fail if a rate-limiter is ever added (serving as a regression hook).

**Recommended fix (v1.1):** Add an in-memory attempt counter keyed by IP (using `headers()` from `next/headers`) with a 5-attempt / 15-minute window before returning a generic lockout response.

### 2. `promoteToActive` always sets `routeDay = 0` (MINOR / by design)

The action hard-codes `routeDay: 0` (Monday) on every promotion. There is no UI to specify which route day the promoted account should start on. For accounts in Cumberland/Northern routes this means their first touch will be scheduled for a Monday, not their natural route day. Whether this is intentional was unclear from the spec — flagged here for product review.

### 3. `logOutcome` does not update `cadences.status` on kill/nurture outcomes (MEDIUM)

The spec calls for kill outcomes (`dnc`, `dead`, `not_interested`) to set `status='killed'` and nurture outcomes (`meeting_cancelled`) to set `status='nurture'`. Inspecting `src/app/actions/index.ts`, `logOutcome` only writes to the `outcomes_ledger` and optionally updates the `touches` row — it never updates `cadences.status`. This means a "DNC" outcome does not mark the account as killed in the CRM. The ledger records the outcome, but the account remains in its prior status.

This is either a v1 intentional gap (status transitions handled separately) or a bug. Tests for the kill/nurture status-transition path are **not written** because the functionality does not exist in the current code — adding tests for non-existent behaviour would create false-positive coverage. Flagged here for the v1.1 sprint.

### 4. `moveMeddpiccStage` has no stage transition validation (LOW)

`moveMeddpiccStage` delegates directly to `updateMeddpicc(companyKey, "stage", stage)` with no guard against illegal transitions (e.g., moving from `Closed-Won` back to `Discovery scheduled`). The Kanban UI is expected to prevent this, but there is no server-side enforcement. A raw Server Action call could set any stage string, including invalid values.

### 5. `meddpicc` row is NOT auto-created on `meeting_booked` outcome (MEDIUM)

The spec calls for a `meddpicc` row to be created when the outcome is `meeting_booked`. No such logic exists in `logOutcome`. There is no trigger in the current Server Actions that inserts a `meddpicc` row. This is a v1.1 item per the 05-backend-impl.md spec notes.

---

## Playwright Notes

Both new e2e specs are **scaffolds** — they require a running dev server (`npm run dev`) and seeded database to execute end-to-end. They use `test.skip()` gracefully when the board is empty (no seeded accounts), so they will not fail in CI without data.

To run e2e against a local server:
```bash
npm run dev &
APP_PASSWORD=adppeo2026 npm run test:e2e
```
