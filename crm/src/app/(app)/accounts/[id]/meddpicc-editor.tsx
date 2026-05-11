"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateMeddpicc } from "@/app/actions";
import type { Meddpicc } from "@/db/schema";

const STAGES = [
  "Nurture",
  "Discovery scheduled",
  "Discovery held",
  "Proposal sent",
  "Closed-Won",
  "Closed-Lost",
];

const FIELDS: { key: keyof Meddpicc; label: string; desc: string }[] = [
  {
    key: "mMetrics",
    label: "Metrics",
    desc: "Quantifiable benefit (HR hrs/wk, comp savings)",
  },
  {
    key: "eEconBuyer",
    label: "Econ buyer",
    desc: "Who signs the check? Owner, CFO?",
  },
  {
    key: "d1DecisionCriteria",
    label: "Decision criteria",
    desc: "What they care about — price, service, comp",
  },
  {
    key: "d2DecisionProcess",
    label: "Decision process",
    desc: "Steps to a yes",
  },
  {
    key: "pPaperProcess",
    label: "Paper process",
    desc: "Contracts, broker AOR, timing",
  },
  { key: "iPain", label: "Pain", desc: "Specific HR/comp/health pain" },
  { key: "cChampion", label: "Champion", desc: "Internal advocate" },
  {
    key: "cmpCompetition",
    label: "Competition",
    desc: "TriNet, Insperity, broker, status quo",
  },
  { key: "nextAction", label: "Next action", desc: "" },
];

export function MeddpiccEditor({
  companyKey,
  meddpicc,
}: {
  companyKey: string;
  meddpicc: Meddpicc | null;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">
          MEDDPICC
        </div>
        <StageSelect
          companyKey={companyKey}
          value={meddpicc?.stage ?? "Nurture"}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {FIELDS.map((f) => (
          <FieldEditor
            key={f.key as string}
            companyKey={companyKey}
            field={f.key as string}
            label={f.label}
            desc={f.desc}
            value={(meddpicc as any)?.[f.key] ?? ""}
          />
        ))}
      </div>
    </Card>
  );
}

function StageSelect({
  companyKey,
  value,
}: {
  companyKey: string;
  value: string;
}) {
  const [pending, start] = useTransition();
  return (
    <Select
      value={value}
      onValueChange={(v) =>
        start(async () => {
          try {
            await updateMeddpicc(companyKey, "stage" as any, v);
            toast.success("Stage updated", { description: v });
          } catch (e: any) {
            toast.error("Failed", { description: e?.message });
          }
        })
      }
    >
      <SelectTrigger className="w-48 h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAGES.map((s) => (
          <SelectItem key={s} value={s}>
            {s}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function FieldEditor({
  companyKey,
  field,
  label,
  desc,
  value,
}: {
  companyKey: string;
  field: string;
  label: string;
  desc: string;
  value: string;
}) {
  const [local, setLocal] = React.useState(value || "");
  const [pending, start] = useTransition();
  const save = () => {
    if (local === (value || "")) return;
    start(async () => {
      try {
        await updateMeddpicc(companyKey, field as any, local);
        toast.success("Saved", { description: label });
      } catch (e: any) {
        toast.error("Save failed", { description: e?.message });
      }
    });
  };

  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <label className="text-xs font-medium text-zinc-200">{label}</label>
        {desc && <span className="text-[10px] text-muted-foreground">{desc}</span>}
      </div>
      <Textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        rows={2}
        className="text-xs"
      />
    </div>
  );
}
