import { requireAuth } from "@/lib/auth";
import { recentPulse } from "@/lib/queries";

/**
 * Recent outcomes feed for the Pulse rail's client-side polling.
 * Requires auth.
 */
export async function GET() {
  await requireAuth();
  const rows = await recentPulse(5);
  return Response.json({
    pulse: rows.map((p) => ({
      id: p.ledger.id,
      companyKey:
        p.account?.companyKey ??
        (p.account?.id != null ? String(p.account.id) : null) ??
        p.ledger.companyKey,
      company: p.account?.company ?? p.account?.name ?? null,
      outcome: p.ledger.outcome,
      channel: p.ledger.channel,
      notes: p.ledger.notes,
      loggedAt: p.ledger.loggedAt,
    })),
    ts: new Date().toISOString(),
  });
}
