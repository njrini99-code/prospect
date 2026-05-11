import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { num } from "@/lib/utils";
import type { Account, Touch } from "@/db/schema";

const CADENCE_DAYS = [0, 3, 8, 15];

export function OverviewPanel({
  account,
  touches,
}: {
  account: Account;
  touches: Touch[];
}) {
  const completedByDay = new Set(
    touches.filter((t) => t.completed).map((t) => t.dayOffset),
  );
  const completedCount = CADENCE_DAYS.filter((d) => completedByDay.has(d)).length;
  const cadenceProgress = (completedCount / CADENCE_DAYS.length) * 100;

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card className="p-4">
        <SectionTitle>Quick facts</SectionTitle>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Fact label="DM" value={account.dmName} />
          <Fact label="Title" value={account.dmTitle} />
          <Fact label="Phone" value={account.phone} mono />
          <Fact label="Email" value={account.dmEmail} mono />
          <Fact label="Vertical" value={account.vertical} />
          <Fact label="NAICS" value={account.naics} mono />
          <Fact label="Employees" value={num(account.ee)} mono />
          <Fact label="ZIP" value={account.zip} mono />
          <Fact label="City" value={account.city} />
          <Fact label="County" value={account.county} />
          <Fact label="Incumbent PEO" value={account.incumbentPeo} />
          <Fact label="Stale incumbent" value={account.incumbentStale ? "Yes" : "No"} />
          <Fact label="WC carrier" value={account.wcCarrier} />
          <Fact label="WC renewal" value={account.wcRenewal} />
          <Fact label="Multi-state" value={account.multiStateLikely ? "Yes" : "No"} />
          <Fact label="Has health" value={account.hasHealthBenefits ? "Yes" : "No"} />
          <Fact label="Growth tier" value={account.growthTier} />
          <Fact label="Fitness tier" value={account.fitnessTier} />
        </dl>
      </Card>

      <div className="space-y-4">
        <Card className="p-4">
          <SectionTitle>Cadence progress</SectionTitle>
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-3">
              {CADENCE_DAYS.map((d, i) => {
                const done = completedByDay.has(d);
                return (
                  <div key={d} className="flex flex-col items-center flex-1">
                    <div
                      className={
                        "h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold ring-2 " +
                        (done
                          ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40"
                          : "bg-zinc-900 text-zinc-500 ring-zinc-800")
                      }
                    >
                      D{d}
                    </div>
                    {i < CADENCE_DAYS.length - 1 && (
                      <div className="absolute" />
                    )}
                  </div>
                );
              })}
            </div>
            <Progress value={cadenceProgress} />
            <div className="text-[11px] text-muted-foreground">
              {completedCount} of {CADENCE_DAYS.length} cadence touches completed
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <SectionTitle>Trigger evidence</SectionTitle>
          <p className="mt-3 text-xs leading-relaxed text-zinc-300 whitespace-pre-wrap">
            {account.evidence || (
              <span className="text-muted-foreground">No evidence recorded.</span>
            )}
          </p>
        </Card>

        <Card className="p-4">
          <SectionTitle>Talk-track</SectionTitle>
          <p className="mt-3 text-xs leading-relaxed text-zinc-200 whitespace-pre-wrap font-mono">
            {account.talkTrack || (
              <span className="text-muted-foreground font-sans">
                No talk-track yet.
              </span>
            )}
          </p>
        </Card>
      </div>
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

function Fact({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-zinc-200" : "text-zinc-200"}>
        {value || "—"}
      </dd>
    </div>
  );
}
