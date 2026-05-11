import { format } from "date-fns";
import {
  todayActions,
  recentPulse,
  kpiSnapshot,
  touchTrend,
} from "@/lib/queries";
import { KpiCards } from "./kpi-cards";
import { TimeBlocks } from "./time-blocks";
import { ActionsPanel } from "./actions-panel";
import { PulseRail } from "./pulse-rail";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodayPage() {
  const [actions, pulse, kpis, trend] = await Promise.all([
    todayActions(),
    recentPulse(8),
    kpiSnapshot(),
    touchTrend(14),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            {format(new Date(), "EEEE, MMM d, yyyy")} · eastern NC
          </p>
        </div>
        <PrintButton />
      </div>

      <KpiCards kpis={kpis} trend={trend} />

      <TimeBlocks />

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <ActionsPanel actions={actions} />
        <PulseRail pulse={pulse} />
      </div>
    </div>
  );
}
