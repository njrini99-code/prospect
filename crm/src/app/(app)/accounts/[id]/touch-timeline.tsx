import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Mail, Phone, MapPin, Linkedin, CheckCircle2, Clock } from "lucide-react";
import type { Touch, OutcomeRow } from "@/db/schema";

const channelIcon = (c?: string | null) => {
  const v = (c || "").toLowerCase();
  if (v === "email" || v === "e") return Mail;
  if (v === "call" || v === "phone") return Phone;
  if (v === "drop" || v === "field") return MapPin;
  if (v === "linkedin" || v === "li") return Linkedin;
  return Clock;
};

export function TouchTimeline({
  touches,
  outcomes,
}: {
  touches: Touch[];
  outcomes: OutcomeRow[];
}) {
  const items = [
    ...touches.map((t) => ({
      kind: "touch" as const,
      date: t.scheduledFor,
      touch: t,
    })),
    ...outcomes.map((o) => ({
      kind: "outcome" as const,
      date: o.loggedAt,
      outcome: o,
    })),
  ].sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  return (
    <Card className="p-4">
      <div className="space-y-4">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No touches yet.
          </div>
        )}
        {items.map((item, i) => {
          if (item.kind === "touch") {
            const Icon = channelIcon(item.touch.channel);
            return (
              <div key={`t-${item.touch.id}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={
                      "h-7 w-7 rounded-full flex items-center justify-center " +
                      (item.touch.completed
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-zinc-800 text-zinc-400")
                    }
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                  {i < items.length - 1 && (
                    <div className="w-px flex-1 bg-border my-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-medium capitalize">
                      {item.touch.channel} · D{item.touch.dayOffset}
                      {item.touch.completed ? (
                        <CheckCircle2 className="h-3 w-3 inline ml-1 text-emerald-400" />
                      ) : null}
                    </span>
                    <span className="text-[10px] font-mono text-muted-foreground">
                      {formatDate(item.touch.scheduledFor)}
                    </span>
                  </div>
                  {item.touch.outcome && (
                    <div className="text-[11px] text-emerald-300 mt-0.5">
                      {item.touch.outcome}
                    </div>
                  )}
                  {item.touch.notes && (
                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                      {item.touch.notes}
                    </p>
                  )}
                </div>
              </div>
            );
          }
          const Icon = channelIcon(item.outcome.channel);
          return (
            <div key={`o-${item.outcome.id}`} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="h-7 w-7 rounded-full bg-emerald-500/15 text-emerald-300 flex items-center justify-center">
                  <Icon className="h-3.5 w-3.5" />
                </div>
                {i < items.length - 1 && (
                  <div className="w-px flex-1 bg-border my-1" />
                )}
              </div>
              <div className="flex-1 pb-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-medium">
                    {item.outcome.outcome}{" "}
                    <span className="text-[11px] text-muted-foreground">
                      via {item.outcome.channel}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground">
                    {formatDate(item.outcome.loggedAt)}
                  </span>
                </div>
                {item.outcome.notes && (
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    {item.outcome.notes}
                  </p>
                )}
                {item.outcome.brokerCaptured && (
                  <p className="text-[10px] text-amber-300 mt-0.5">
                    broker captured: {item.outcome.brokerCaptured}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
