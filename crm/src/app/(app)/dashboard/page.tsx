import {
  kpiSnapshot,
  touchTrend,
  conversionByTrigger,
  portfolioMix,
  listWeights,
  getIndustryTrends,
} from "@/lib/queries";
import { DashboardCharts } from "./dashboard-charts";
import { Card } from "@/components/ui/card";
import { TrendingUp, Sparkles } from "lucide-react";
import { num } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpis, trend, byTrigger, mix, weights, industryTrends] = await Promise.all([
    kpiSnapshot(),
    touchTrend(28),
    conversionByTrigger(),
    portfolioMix(),
    listWeights(),
    getIndustryTrends(),
  ]);

  const targetStages = 10;
  const stageDelta = kpis.meetingsBooked - targetStages;

  // Top 3 learned weights as "coaching"
  const top = [...weights]
    .filter((w) => w.multiplier && Number(w.multiplier) >= 1.1)
    .slice(0, 3);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Weekly metrics, conversion trends, and learned coaching
        </p>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
              Stage progressions this week
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {num(kpis.meetingsBooked)}
              </span>
              <span className="text-sm text-muted-foreground">
                / {targetStages} target
              </span>
              <span
                className={
                  "ml-2 inline-flex items-center gap-0.5 text-xs " +
                  (stageDelta >= 0 ? "text-emerald-400" : "text-rose-400")
                }
              >
                <TrendingUp className="h-3 w-3" />
                {stageDelta >= 0 ? "+" : ""}
                {stageDelta}
              </span>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6 text-xs">
            <Stat label="Touches" v={num(kpis.touchesThisWeek)} />
            <Stat label="Active" v={num(kpis.activeAccounts)} />
            <Stat label="Conv %" v={kpis.conversionPct.toFixed(1) + "%"} />
          </div>
        </div>
      </Card>

      <DashboardCharts
        trend={trend}
        byTrigger={byTrigger}
        mix={mix}
        industryTrends={industryTrends}
      />

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[11px] uppercase tracking-wider font-semibold">
            Coaching adjustments (learned)
          </span>
        </div>
        {top.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Not enough outcomes yet to compute learned multipliers. Keep logging.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-3">
            {top.map((w) => (
              <div
                key={w.id}
                className="rounded-md border border-emerald-500/20 bg-emerald-500/[0.04] p-3"
              >
                <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
                  {w.dim}
                </div>
                <div className="text-sm font-medium mt-0.5">
                  Lean into {w.key}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Converting{" "}
                  <span className="font-mono text-emerald-300">
                    {Number(w.multiplier).toFixed(2)}×
                  </span>{" "}
                  baseline
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="font-mono tabular-nums">{v}</span>
    </div>
  );
}
