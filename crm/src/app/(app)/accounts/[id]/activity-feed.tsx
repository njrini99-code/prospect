import { Card } from "@/components/ui/card";
import { timeAgo } from "@/lib/utils";
import { Activity, MessageSquare, CheckCircle2 } from "lucide-react";
import type { Touch, OutcomeRow, Note } from "@/db/schema";

type Item =
  | { kind: "touch"; ts: string; touch: Touch }
  | { kind: "outcome"; ts: string; outcome: OutcomeRow }
  | { kind: "note"; ts: string; note: Note };

export function ActivityFeed({
  touches,
  outcomes,
  notes,
}: {
  touches: Touch[];
  outcomes: OutcomeRow[];
  notes: Note[];
}) {
  const items: Item[] = [
    ...touches
      .filter((t) => t.completed)
      .map((t) => ({
        kind: "touch" as const,
        ts: t.scheduledFor ?? "",
        touch: t,
      })),
    ...outcomes.map((o) => ({
      kind: "outcome" as const,
      ts: o.loggedAt ?? "",
      outcome: o,
    })),
    ...notes.map((n) => ({
      kind: "note" as const,
      ts:
        n.createdAt == null
          ? ""
          : typeof n.createdAt === "string"
            ? n.createdAt
            : n.createdAt.toISOString(),
      note: n,
    })),
  ].sort((a, b) => b.ts.localeCompare(a.ts));

  return (
    <Card className="p-4">
      <div className="space-y-3">
        {items.length === 0 && (
          <div className="text-sm text-muted-foreground text-center py-8">
            No activity yet.
          </div>
        )}
        {items.map((item, i) => {
          if (item.kind === "outcome") {
            return (
              <Row
                key={`o-${item.outcome.id}`}
                icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                title={item.outcome.outcome || "Outcome"}
                sub={`${item.outcome.channel ?? ""}${item.outcome.notes ? " — " + item.outcome.notes : ""}`}
                ts={item.ts}
              />
            );
          }
          if (item.kind === "touch") {
            return (
              <Row
                key={`t-${item.touch.id}`}
                icon={<Activity className="h-3.5 w-3.5 text-blue-400" />}
                title={`Touch ${item.touch.channel ?? ""} D${item.touch.dayOffset ?? ""}`}
                sub={item.touch.notes || ""}
                ts={item.ts}
              />
            );
          }
          return (
            <Row
              key={`n-${item.note.id}`}
              icon={<MessageSquare className="h-3.5 w-3.5 text-violet-400" />}
              title="Note added"
              sub={item.note.body}
              ts={item.ts}
            />
          );
        })}
      </div>
    </Card>
  );
}

function Row({
  icon,
  title,
  sub,
  ts,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  ts: string;
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{title}</div>
        {sub && (
          <div className="text-[11px] text-muted-foreground truncate">{sub}</div>
        )}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground shrink-0">
        {timeAgo(ts)}
      </div>
    </div>
  );
}
