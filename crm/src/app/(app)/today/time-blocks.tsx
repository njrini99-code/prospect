import { Card } from "@/components/ui/card";

const BLOCKS = [
  {
    range: "09:00 – 10:00",
    label: "Internal mtg",
    pct: [0, 12.5],
    tone: "bg-blue-500/30 ring-blue-500/40",
  },
  {
    range: "10:00 – 11:30",
    label: "Email batch",
    pct: [12.5, 31.25],
    tone: "bg-emerald-500/30 ring-emerald-500/40",
  },
  {
    range: "11:30 – 12:30",
    label: "Power hour (call)",
    pct: [31.25, 43.75],
    tone: "bg-rose-500/30 ring-rose-500/40",
  },
  {
    range: "12:30 – 14:30",
    label: "Office work",
    pct: [43.75, 68.75],
    tone: "bg-zinc-700/40 ring-zinc-600/40",
  },
  {
    range: "14:30 – 16:00",
    label: "Training (locked)",
    pct: [68.75, 87.5],
    tone: "bg-amber-500/30 ring-amber-500/40",
  },
  {
    range: "16:00 – 17:00",
    label: "Wrap / log",
    pct: [87.5, 100],
    tone: "bg-violet-500/30 ring-violet-500/40",
  },
];

export function TimeBlocks() {
  return (
    <Card className="p-4">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
          Today's blocks
        </div>
        <div className="text-[10px] font-mono text-muted-foreground">
          09 — 17
        </div>
      </div>
      <div className="relative h-7 rounded-md bg-zinc-900 overflow-hidden">
        {BLOCKS.map((b, i) => (
          <div
            key={i}
            className={`absolute inset-y-0 ring-1 ${b.tone} transition-colors`}
            style={{
              left: `${b.pct[0]}%`,
              right: `${100 - b.pct[1]}%`,
            }}
            title={`${b.range} — ${b.label}`}
          />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 sm:grid-cols-6 gap-2">
        {BLOCKS.map((b, i) => (
          <div key={i} className="flex flex-col gap-0">
            <div className="text-[10px] font-mono text-muted-foreground">
              {b.range}
            </div>
            <div className="text-[11px] font-medium">{b.label}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
