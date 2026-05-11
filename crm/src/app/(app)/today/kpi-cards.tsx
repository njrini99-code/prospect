import { Card } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import {
  TrendingDown,
  TrendingUp,
  Phone,
  Users,
  Calendar,
  Percent,
} from "lucide-react";
import { cn, num } from "@/lib/utils";

type Trend = { date: string; touches: number };

export function KpiCards({
  kpis,
  trend,
}: {
  kpis: {
    touchesThisWeek: number;
    touchesPrevWeek: number;
    touchesTarget?: number;
    activeAccounts: number;
    activeTarget?: number;
    meetingsBooked: number;
    meetingsTarget?: number;
    conversionPct: number;
  };
  trend: Trend[];
}) {
  const delta = kpis.touchesThisWeek - kpis.touchesPrevWeek;
  const deltaPct =
    kpis.touchesPrevWeek > 0
      ? Math.round(
          ((kpis.touchesThisWeek - kpis.touchesPrevWeek) /
            kpis.touchesPrevWeek) *
            100,
        )
      : 0;

  const trendValues = trend.map((t) => t.touches);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Kpi
        label="Touches this week"
        value={`${num(kpis.touchesThisWeek)}`}
        target={String(kpis.touchesTarget ?? 45)}
        delta={delta}
        deltaPct={deltaPct}
        accent="emerald"
        icon={<Phone className="h-3.5 w-3.5" />}
        trend={trendValues}
      />
      <Kpi
        label="Active accounts"
        value={`${num(kpis.activeAccounts)}`}
        target={String(kpis.activeTarget ?? 50)}
        accent="blue"
        icon={<Users className="h-3.5 w-3.5" />}
        trend={trendValues}
      />
      <Kpi
        label="Meetings booked"
        value={`${num(kpis.meetingsBooked)}`}
        target={String(kpis.meetingsTarget ?? 3)}
        accent="violet"
        icon={<Calendar className="h-3.5 w-3.5" />}
        trend={trendValues}
      />
      <Kpi
        label="Conversion %"
        value={`${kpis.conversionPct.toFixed(1)}%`}
        accent="amber"
        icon={<Percent className="h-3.5 w-3.5" />}
        trend={trendValues}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  target,
  delta,
  deltaPct,
  accent,
  icon,
  trend,
}: {
  label: string;
  value: string;
  target?: string;
  delta?: number;
  deltaPct?: number;
  accent: "emerald" | "blue" | "violet" | "amber";
  icon: React.ReactNode;
  trend: number[];
}) {
  const colors = {
    emerald: "text-emerald-400",
    blue: "text-blue-400",
    violet: "text-violet-400",
    amber: "text-amber-400",
  } as const;
  return (
    <Card className="p-4 flex flex-col gap-2 relative overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
          <span className={colors[accent]}>{icon}</span>
          {label}
        </div>
        {delta != null && (
          <div
            className={cn(
              "flex items-center gap-0.5 text-[10px] font-mono",
              delta >= 0 ? "text-emerald-400" : "text-rose-400",
            )}
          >
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {deltaPct != null ? `${deltaPct}%` : ""}
          </div>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">
          {value}
        </div>
        {target && (
          <div className="text-xs text-muted-foreground font-mono">
            / {target}
          </div>
        )}
      </div>
      <Sparkline
        data={trend}
        stroke={accent}
        className="h-6 w-full"
        ariaLabel={`${label} trend`}
      />
    </Card>
  );
}
