import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { triggerColor, num, formatDate } from "@/lib/utils";
import type { Trigger, Carrier, IncumbentPeo } from "@/db/schema";

/**
 * v1.1: drill-down panel on /accounts/[id] showing every active trigger,
 * every Schedule A carrier, and the company's incumbent PEO history.
 * Triggers are rendered with a colored type badge + numeric weight badge.
 */
export function SignalsAndCarriers({
  triggers,
  carriers,
  incumbents,
}: {
  triggers: Trigger[];
  carriers: Carrier[];
  incumbents: IncumbentPeo[];
}) {
  // Sort incumbents by stale status (non-stale first), then most recent.
  const stale = (p: IncumbentPeo) =>
    /expired|lapsed|cancelled/i.test(p.evidence ?? "");
  const sortedIncumbents = [...incumbents].sort((a, b) => {
    const sa = stale(a) ? 1 : 0;
    const sb = stale(b) ? 1 : 0;
    if (sa !== sb) return sa - sb;
    const da = a.observedAt ? new Date(a.observedAt as any).getTime() : 0;
    const db = b.observedAt ? new Date(b.observedAt as any).getTime() : 0;
    return db - da;
  });

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <SectionTitle>Active triggers ({triggers.length})</SectionTitle>
        {triggers.length === 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            No triggers recorded for this account.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {triggers.map((t) => (
              <li
                key={t.id}
                className="flex items-start gap-3 text-xs"
              >
                <span
                  className={
                    "rounded-md px-1.5 py-0.5 font-medium text-[10px] shrink-0 " +
                    triggerColor(t.triggerType)
                  }
                >
                  {t.triggerType ?? "trigger"}
                </span>
                <Badge
                  variant="secondary"
                  className="h-5 px-1.5 font-mono tabular-nums text-[10px] shrink-0"
                >
                  {t.score == null ? "—" : Number(t.score).toFixed(1)}
                </Badge>
                <div className="flex-1 min-w-0">
                  <div className="text-zinc-200 truncate">
                    {t.evidence ?? "—"}
                  </div>
                  {t.triggerDate && (
                    <div className="text-[10px] font-mono text-muted-foreground">
                      {formatDate(t.triggerDate)}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>
          Schedule A carriers ({carriers.length})
        </SectionTitle>
        {carriers.length === 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            No carriers on file. No 5500 Schedule A signal yet.
          </div>
        ) : (
          <div className="mt-3 grid sm:grid-cols-2 gap-2">
            {carriers.map((c) => (
              <div
                key={c.id}
                className="rounded-md border border-border bg-zinc-900/40 p-2 text-xs"
              >
                <div className="font-medium text-zinc-200 truncate">
                  {c.carrierName ?? "—"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                  {c.benefitType ?? "—"}
                  {c.planYear ? ` · ${c.planYear}` : ""}
                  {c.coveredLives ? ` · ${num(c.coveredLives)} lives` : ""}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionTitle>
          Incumbent PEO history ({incumbents.length})
        </SectionTitle>
        {sortedIncumbents.length === 0 ? (
          <div className="mt-2 text-xs text-muted-foreground">
            No confirmed PEO incumbent.
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {sortedIncumbents.map((p) => {
              const isStale = stale(p);
              return (
                <li key={p.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-200">
                      {p.peoBrand ?? "—"}
                    </span>
                    {p.confidence && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-mono"
                      >
                        {p.confidence}
                      </Badge>
                    )}
                    {isStale && (
                      <Badge
                        variant="secondary"
                        className="h-5 px-1.5 text-[10px] font-mono bg-rose-500/15 text-rose-300"
                      >
                        stale
                      </Badge>
                    )}
                  </div>
                  {p.evidence && (
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                      {p.evidence}
                    </div>
                  )}
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {p.filingYear ? `FY ${p.filingYear} · ` : ""}
                    {formatDate(p.observedAt as any)}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
      {children}
    </div>
  );
}
