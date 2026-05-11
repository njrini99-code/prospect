"use client";

import { BarChart, DonutChart, Legend } from "@tremor/react";
import { Card } from "@/components/ui/card";
import { AreaChart } from "@/components/ui/area-chart";
import { num } from "@/lib/utils";

const PALETTE = [
  "emerald",
  "blue",
  "violet",
  "amber",
  "rose",
  "orange",
  "cyan",
  "fuchsia",
];

export function DashboardCharts({
  trend,
  byTrigger,
  mix,
  industryTrends,
}: {
  trend: { date: string; touches: number }[];
  byTrigger: { trigger: string; conv: number; n: number }[];
  mix: { name: string; value: number }[];
  industryTrends: {
    vertical: string;
    companies: number;
    meanScore: number;
    totalScore: number;
    topCarrier: string | null;
  }[];
}) {
  // Coerce trend14d shape -> AreaChartPoint
  const trendPoints = trend.map((t) => ({ date: t.date, value: t.touches }));

  // Industry trends -> top 6 verticals by company count
  const topVerticals = [...industryTrends]
    .filter((v) => v.vertical && v.vertical !== "Unknown")
    .slice(0, 6);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Touches · last 4 weeks
        </div>
        <AreaChart
          data={trendPoints}
          height={220}
          stroke="emerald"
          className="h-56 text-zinc-300"
          formatValue={(n) => num(n)}
          formatDate={(s) => s.slice(5)}
        />
      </Card>

      <Card className="p-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Conversion % by trigger
        </div>
        <BarChart
          data={byTrigger}
          index="trigger"
          categories={["conv"]}
          colors={["emerald"]}
          showLegend={false}
          showAnimation
          className="h-56"
          showGridLines={false}
          layout="vertical"
        />
      </Card>

      <Card className="p-4 md:col-span-2">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          Portfolio mix · active accounts
        </div>
        <div className="flex items-center gap-6">
          <DonutChart
            data={mix}
            index="name"
            category="value"
            colors={PALETTE}
            showAnimation
            className="h-56 w-56"
          />
          <Legend
            categories={mix.map((m) => m.name)}
            colors={PALETTE}
            className="flex-1"
          />
        </div>
      </Card>

      <Card className="p-4 md:col-span-2">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground mb-3">
          Industry trends · qualified universe by vertical
        </div>
        {topVerticals.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Not enough industry data yet.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {topVerticals.map((v) => (
              <div
                key={v.vertical}
                className="rounded-md border border-border bg-zinc-900/40 p-3"
              >
                <div className="flex items-baseline justify-between">
                  <div className="text-sm font-medium truncate">
                    {v.vertical}
                  </div>
                  <div className="text-[11px] font-mono tabular-nums text-emerald-300">
                    {num(v.companies)} co.
                  </div>
                </div>
                <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                  μ score {v.meanScore.toFixed(1)} · total{" "}
                  {num(Math.round(v.totalScore))}
                </div>
                {v.topCarrier && (
                  <div className="mt-1 text-[11px] text-zinc-300 truncate">
                    top carrier: {v.topCarrier}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
