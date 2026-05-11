import { Card } from "@/components/ui/card";
import { AlertCircle, Crown, Calculator, Heart, Briefcase, FileText, Scale } from "lucide-react";
import type { BuyerCast } from "@/db/schema";
import { cn } from "@/lib/utils";

const ROLES = [
  { key: "owner", label: "Owner", icon: Crown, accent: "text-amber-400" },
  { key: "cfo", label: "CFO", icon: Calculator, accent: "text-blue-400" },
  {
    key: "officeMom",
    label: "Office Mom",
    icon: Heart,
    accent: "text-rose-400",
  },
  {
    key: "broker",
    label: "Broker",
    icon: Briefcase,
    accent: "text-emerald-400",
    critical: true,
  },
  { key: "cpa", label: "CPA", icon: FileText, accent: "text-violet-400" },
  {
    key: "attorney",
    label: "Attorney",
    icon: Scale,
    accent: "text-orange-400",
  },
] as const;

export function BuyerCastPanel({
  buyerCast,
}: {
  buyerCast: BuyerCast | null;
}) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
      {ROLES.map((r) => {
        const Icon = r.icon;
        const value = buyerCast ? ((buyerCast as any)[r.key] as string | null) : null;
        const missing = !value;
        const isCritical = (r as any).critical && missing;
        return (
          <Card
            key={r.key}
            className={cn(
              "p-4 transition-colors",
              isCritical && "border-rose-500/30 bg-rose-500/5",
            )}
          >
            <div className="flex items-center gap-2">
              <Icon className={`h-4 w-4 ${r.accent}`} />
              <span className="text-xs font-semibold uppercase tracking-wider">
                {r.label}
              </span>
              {isCritical && (
                <AlertCircle className="h-3.5 w-3.5 text-rose-400 ml-auto" />
              )}
            </div>
            <div
              className={cn(
                "mt-2 text-sm",
                missing ? "text-muted-foreground italic" : "",
              )}
            >
              {value || (isCritical ? "Missing — this is a deal-killer" : "—")}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
