"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Activity } from "lucide-react";
import { timeAgo } from "@/lib/utils";
import type { Account } from "@/db/schema";

type LedgerSnippet = {
  id: number;
  companyKey: string | null;
  outcome: string | null;
  channel: string | null;
  notes: string | null;
  loggedAt: string | null;
};

type ServerPulse = {
  ledger: LedgerSnippet;
  account: Account | null;
};

type PollPulse = {
  id: number;
  companyKey: string | null;
  company: string | null;
  outcome: string | null;
  channel: string | null;
  notes: string | null;
  loggedAt: string | null;
};

const POLL_INTERVAL_MS = 30_000;

function fromServer(p: ServerPulse): PollPulse {
  return {
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
  };
}

export function PulseRail({ pulse }: { pulse: ServerPulse[] }) {
  const [rows, setRows] = React.useState<PollPulse[]>(() => pulse.map(fromServer));
  const [isLive, setIsLive] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/pulse", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setIsLive(false);
          return;
        }
        const data = (await res.json()) as { pulse: PollPulse[] };
        if (!cancelled) {
          setRows(data.pulse);
          setIsLive(true);
        }
      } catch {
        if (!cancelled) setIsLive(false);
      }
    };
    const id = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-xs uppercase tracking-wider font-semibold">
            Pulse
          </span>
          <Badge
            variant="secondary"
            className={
              "ml-auto font-mono text-[10px] " +
              (isLive ? "" : "opacity-60")
            }
          >
            {isLive ? "live" : "offline"}
          </Badge>
        </div>
        <div className="divide-y divide-border/60">
          {rows.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">
              No recent outcomes. Go log one.
            </div>
          )}
          {rows.map((p) => (
            <div key={p.id} className="px-4 py-2.5">
              <div className="flex items-baseline justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Dot outcome={p.outcome ?? ""} />
                  {p.companyKey ? (
                    <Link
                      href={`/accounts/${encodeURIComponent(p.companyKey)}`}
                      className="text-sm font-medium truncate hover:text-emerald-400 transition-colors"
                    >
                      {p.company || "—"}
                    </Link>
                  ) : (
                    <span className="text-sm font-medium truncate">
                      {p.company || "—"}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                  {timeAgo(p.loggedAt)}
                </span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5 truncate">
                <span className="font-medium text-zinc-300">
                  {p.outcome}
                </span>
                {p.channel ? ` · ${p.channel}` : ""}
                {p.notes ? ` — ${p.notes}` : ""}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4 border-emerald-500/20 bg-emerald-500/[0.03]">
        <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
          Pro-tip
        </div>
        <p className="text-xs mt-1.5 leading-relaxed text-zinc-300">
          Press <kbd className="rounded border border-border bg-card px-1 font-mono text-[10px]">⌘K</kbd> to jump anywhere or run a quick action.
        </p>
      </Card>
    </div>
  );
}

function Dot({ outcome }: { outcome: string }) {
  const o = outcome.toLowerCase();
  let cls = "bg-zinc-500";
  if (o.includes("book") || o.includes("interested") || o.includes("discovery"))
    cls = "bg-emerald-500";
  else if (o.includes("reached")) cls = "bg-blue-500";
  else if (o.includes("vm") || o.includes("no_answer")) cls = "bg-amber-500";
  else if (o.includes("dead") || o.includes("not_interested")) cls = "bg-rose-500";
  return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cls}`} />;
}
