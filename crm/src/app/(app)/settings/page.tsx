import { listWeights } from "@/lib/queries";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { logoutAction } from "@/app/actions";
import { LogOut, Database, Key, Layers, Download } from "lucide-react";
import { ThemeRow } from "./theme-row";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const weights = await listWeights();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure cadence, appearance, weights, and integrations
        </p>
      </div>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Layers className="h-4 w-4 text-emerald-400" />
          <span className="text-sm font-semibold">Cadence</span>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { d: "D0", c: "Drop" },
            { d: "D3", c: "Email" },
            { d: "D8", c: "Call" },
            { d: "D15", c: "LinkedIn" },
          ].map((s) => (
            <div key={s.d} className="rounded-md border border-border p-3 text-center">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.d}
              </div>
              <div className="text-sm font-medium mt-0.5">{s.c}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Database className="h-4 w-4 text-violet-400" />
          <span className="text-sm font-semibold">Learned weights</span>
          <Badge variant="secondary" className="ml-1 font-mono text-[10px]">
            {weights.length}
          </Badge>
        </div>
        <div className="max-h-64 overflow-y-auto scrollbar-thin space-y-1">
          {weights.length === 0 && (
            <p className="text-xs text-muted-foreground">
              No learned weights yet. Re-run the migration script after logging enough
              outcomes.
            </p>
          )}
          {weights.map((w) => (
            <div
              key={w.id}
              className="flex items-baseline justify-between text-xs py-1"
            >
              <span className="font-mono">
                {w.dim}:{w.key}
              </span>
              <span
                className={
                  "font-mono tabular-nums " +
                  (Number(w.multiplier) >= 1.1
                    ? "text-emerald-400"
                    : Number(w.multiplier) <= 0.9
                      ? "text-rose-400"
                      : "text-zinc-400")
                }
              >
                {Number(w.multiplier).toFixed(3)}×
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <ThemeRow />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Key className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-semibold">Integrations</span>
        </div>
        <div className="space-y-2 text-xs">
          <KV k="DATABASE_URL" v={process.env.DATABASE_URL ? "set" : "missing"} />
          <KV k="APP_PASSWORD" v={process.env.APP_PASSWORD ? "set" : "missing"} />
          <KV k="MAPBOX_TOKEN" v={process.env.MAPBOX_TOKEN ? "set" : "(optional, not set)"} />
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-blue-400" />
          <span className="text-sm font-semibold">Export</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled>
            Export accounts CSV
          </Button>
          <Button variant="outline" size="sm" disabled>
            Export touches CSV
          </Button>
          <Button variant="outline" size="sm" disabled>
            Export outcomes CSV
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          CSV export endpoints are scaffolded — wire to{" "}
          <code className="font-mono">/api/export</code> when needed.
        </p>
      </Card>

      <Separator />

      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </Button>
      </form>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  const set = v === "set";
  return (
    <div className="flex items-baseline justify-between font-mono">
      <span className="text-muted-foreground">{k}</span>
      <span className={set ? "text-emerald-400" : "text-rose-400"}>{v}</span>
    </div>
  );
}
