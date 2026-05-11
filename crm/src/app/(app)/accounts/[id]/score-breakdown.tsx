import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Sparkles, TrendingUp } from "lucide-react";
import { num } from "@/lib/utils";
import type { Account } from "@/db/schema";

export function ScoreBreakdown({ account }: { account: Account }) {
  const raw = Number(account.scoreRaw ?? 0);
  const overlay = Number(account.scoreOverlay ?? 0);
  const weight = Number(account.weightMult ?? 1);
  const total = Number(account.score ?? 0);
  const rawPct = Math.min(100, raw);
  const overlayPct = Math.min(100, overlay);
  const weightPct = Math.min(100, weight * 50);

  return (
    <div className="lg:sticky lg:top-20 lg:self-start space-y-4">
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3 text-emerald-400" />
            Score breakdown
          </div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {total.toFixed(0)}
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <Bar
            label="Raw signal"
            value={raw}
            pct={rawPct}
            tone="bg-blue-500"
            desc="Base score from trigger evidence"
          />
          <Bar
            label="Overlay"
            value={overlay}
            pct={overlayPct}
            tone="bg-violet-500"
            desc="Industry/county/timing boost"
          />
          <Bar
            label="Weight ×"
            value={weight}
            pct={weightPct}
            tone="bg-emerald-500"
            desc="Learned multiplier from outcomes"
            mono
          />
        </div>
      </Card>

      <Card className="p-4 border-emerald-500/20 bg-emerald-500/[0.03]">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold text-emerald-400">
          <TrendingUp className="h-3 w-3" />
          Estimated value
        </div>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-xl font-semibold tracking-tight tabular-nums">
            ${num((account.ee ?? 0) * 1500)}
          </span>
          <span className="text-[10px] text-muted-foreground">/ yr</span>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {num(account.ee)} EE × ~$1.5k/EE PEO admin
        </div>
      </Card>
    </div>
  );
}

function Bar({
  label,
  value,
  pct,
  tone,
  desc,
  mono,
}: {
  label: string;
  value: number;
  pct: number;
  tone: string;
  desc: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-medium">{label}</div>
        <div className={"text-xs tabular-nums " + (mono ? "font-mono" : "")}>
          {value.toFixed(mono ? 2 : 1)}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground">{desc}</div>
      <div className="mt-1.5 relative h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`absolute inset-y-0 left-0 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
