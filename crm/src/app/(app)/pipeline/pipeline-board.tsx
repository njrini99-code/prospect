"use client";

import * as React from "react";
import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { moveMeddpiccStage } from "@/app/actions";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";

type Card = {
  stage: string | null;
  companyKey: string | null;
  company: string | null;
  firstMeetingDate: string | null;
  mMetrics: string | null;
  eEconBuyer: string | null;
  iPain: string | null;
  cChampion: string | null;
  nextAction: string | null;
};

const STAGE_TONE: Record<string, string> = {
  "Discovery scheduled": "ring-blue-500/30 bg-blue-500/[0.04]",
  "Discovery held": "ring-violet-500/30 bg-violet-500/[0.04]",
  "Proposal sent": "ring-amber-500/30 bg-amber-500/[0.04]",
  "Closed-Won": "ring-emerald-500/30 bg-emerald-500/[0.04]",
  "Closed-Lost": "ring-rose-500/30 bg-rose-500/[0.04]",
  Nurture: "ring-zinc-700 bg-zinc-900/40",
};

export function PipelineBoard({
  stages,
  grouped,
}: {
  stages: string[];
  grouped: Record<string, Card[]>;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin">
      {stages.map((s) => (
        <Column key={s} stage={s} cards={grouped[s] || []} />
      ))}
    </div>
  );
}

function Column({ stage, cards }: { stage: string; cards: Card[] }) {
  const tone = STAGE_TONE[stage] || "ring-zinc-700";
  return (
    <div className={cn("w-72 shrink-0 rounded-lg ring-1", tone)}>
      <div className="px-3 py-2 flex items-center justify-between border-b border-border/60">
        <div className="text-xs font-semibold tracking-tight">{stage}</div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {cards.length}
        </Badge>
      </div>
      <div className="p-2 space-y-2 min-h-[200px]">
        {cards.length === 0 && (
          <div className="text-[11px] text-muted-foreground text-center py-8">
            Empty
          </div>
        )}
        {cards.map((c, i) => (
          <DealCard key={c.companyKey || i} card={c} stages={Object.keys(STAGE_TONE)} />
        ))}
      </div>
    </div>
  );
}

function DealCard({ card, stages }: { card: Card; stages: string[] }) {
  const [pending, start] = useTransition();

  const fillScore = (s: string | null | undefined) =>
    s ? (s.length > 5 ? 100 : (s.length / 5) * 100) : 0;

  const filled = [
    fillScore(card.mMetrics),
    fillScore(card.eEconBuyer),
    fillScore(card.iPain),
    fillScore(card.cChampion),
  ];
  const avg = Math.round(filled.reduce((a, b) => a + b, 0) / filled.length);

  return (
    <Card className="p-3 hover:bg-zinc-900 transition-colors">
      {card.company && card.companyKey ? (
        <Link
          href={`/accounts/${encodeURIComponent(card.companyKey)}`}
          className="font-medium text-sm hover:text-emerald-400 transition-colors line-clamp-1"
        >
          {card.company}
        </Link>
      ) : (
        <span className="font-medium text-sm">{card.company || "—"}</span>
      )}
      <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">
        {card.firstMeetingDate ?? "no meeting yet"}
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1">
        {["M", "E", "I", "C"].map((letter, i) => (
          <div key={letter} className="text-center">
            <div className="text-[9px] font-mono text-muted-foreground mb-0.5">
              {letter}
            </div>
            <div className="relative h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-emerald-500/60"
                style={{ width: `${filled[i]}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {card.nextAction && (
        <p className="mt-2 text-[11px] text-zinc-400 line-clamp-2 leading-relaxed">
          → {card.nextAction}
        </p>
      )}
      <div className="mt-2 flex items-center justify-between">
        <div className="text-[10px] text-emerald-400">{avg}% fit</div>
        {card.companyKey && (
          <Select
            value={card.stage || "Nurture"}
            onValueChange={(v) =>
              start(async () => {
                try {
                  await moveMeddpiccStage(card.companyKey!, v);
                  toast.success("Moved", { description: v });
                } catch (e: any) {
                  toast.error("Failed", { description: e?.message });
                }
              })
            }
          >
            <SelectTrigger className="h-6 w-28 text-[10px] px-1.5">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </Card>
  );
}
