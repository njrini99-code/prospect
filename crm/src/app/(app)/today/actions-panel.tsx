"use client";

import * as React from "react";
import { useOptimistic } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TouchLogger } from "@/components/touch-logger";
import { triggerColor, scoreColor, num, channelLabel } from "@/lib/utils";
import {
  Phone,
  Mail,
  MapPin,
  Linkedin,
  ChevronRight,
  Flame,
  CheckCircle2,
  Activity,
  Building2,
} from "lucide-react";
import type { Account, Touch } from "@/db/schema";

type Row = { touch: Touch; account: Account };

// Local store of optimistically-completed touches, keyed by touch id.
type OptimisticEntry = { outcome: string };
type OptimisticAction =
  | { type: "complete"; touchId: number; outcome: string }
  | { type: "revert"; touchId: number };

// React context so any TouchLogger nested in the tree can dispatch an
// optimistic update without prop-drilling.
const OptimisticCtx = React.createContext<{
  optimistic: Map<number, OptimisticEntry>;
  dispatch: (payload: {
    touchId?: number;
    outcome: string;
    revert?: boolean;
  }) => void;
} | null>(null);

function optimisticReducer(
  state: Map<number, OptimisticEntry>,
  action: OptimisticAction,
): Map<number, OptimisticEntry> {
  const next = new Map(state);
  if (action.type === "complete") {
    next.set(action.touchId, { outcome: action.outcome });
  } else if (action.type === "revert") {
    next.delete(action.touchId);
  }
  return next;
}

export function ActionsPanel({ actions }: { actions: Row[] }) {
  const [optimistic, addOptimistic] = useOptimistic<
    Map<number, OptimisticEntry>,
    OptimisticAction
  >(new Map(), optimisticReducer);

  const dispatch = React.useCallback(
    (payload: { touchId?: number; outcome: string; revert?: boolean }) => {
      if (payload.touchId == null) return;
      if (payload.revert) {
        addOptimistic({ type: "revert", touchId: payload.touchId });
      } else {
        addOptimistic({
          type: "complete",
          touchId: payload.touchId,
          outcome: payload.outcome,
        });
      }
    },
    [addOptimistic],
  );

  // Hide rows that were optimistically completed; their outcome shows in toast.
  const visible = actions.filter((r) => !optimistic.has(r.touch.id));
  const warm: Row[] = [];
  const emails: Row[] = [];
  const calls: Row[] = [];
  const linkedin: Row[] = [];
  const drops: Row[] = [];

  for (const r of visible) {
    const ch = (r.touch.channel || "").toLowerCase();
    if (
      r.account.primaryTrigger?.toLowerCase().includes("warm") ||
      r.account.status === "WARM" ||
      (r.account.score && Number(r.account.score) >= 75)
    ) {
      warm.push(r);
    }
    if (ch === "email" || ch === "e") emails.push(r);
    else if (ch === "call" || ch === "phone") calls.push(r);
    else if (ch === "linkedin" || ch === "li") linkedin.push(r);
    else if (ch === "drop" || ch === "field") drops.push(r);
  }

  return (
    <OptimisticCtx.Provider value={{ optimistic, dispatch }}>
      <PanelInner
        warm={warm}
        emails={emails}
        calls={calls}
        linkedin={linkedin}
        drops={drops}
      />
    </OptimisticCtx.Provider>
  );
}

function PanelInner({
  warm,
  emails,
  calls,
  linkedin,
  drops,
}: {
  warm: Row[];
  emails: Row[];
  calls: Row[];
  linkedin: Row[];
  drops: Row[];
}) {

  return (
    <div className="space-y-4">
      <Section
        title="Warm follow-ups"
        accent="text-rose-400"
        icon={<Flame className="h-3.5 w-3.5" />}
        count={warm.length}
      >
        {warm.length === 0 ? (
          <Empty msg="No warm follow-ups. Run the cold queue." />
        ) : (
          <div className="space-y-2">
            {warm.slice(0, 8).map((r) => (
              <WarmRow key={r.touch.id} row={r} />
            ))}
          </div>
        )}
      </Section>

      <div className="grid md:grid-cols-2 gap-4">
        <Section
          title="Verified emails to send"
          accent="text-emerald-400"
          icon={<Mail className="h-3.5 w-3.5" />}
          count={emails.length}
        >
          {emails.length === 0 ? (
            <Empty msg="No emails queued." />
          ) : (
            <ul className="space-y-1.5">
              {emails.slice(0, 8).map((r) => (
                <EmailRow key={r.touch.id} row={r} />
              ))}
            </ul>
          )}
        </Section>
        <Section
          title="Cold power hour"
          accent="text-amber-400"
          icon={<Phone className="h-3.5 w-3.5" />}
          count={calls.length}
        >
          {calls.length === 0 ? (
            <Empty msg="No calls scheduled for today." />
          ) : (
            <ul className="space-y-1.5">
              {calls.slice(0, 8).map((r) => (
                <CallRow key={r.touch.id} row={r} />
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section
          title="LinkedIn touches"
          accent="text-blue-400"
          icon={<Linkedin className="h-3.5 w-3.5" />}
          count={linkedin.length}
        >
          {linkedin.length === 0 ? (
            <Empty msg="No LinkedIn moves today." />
          ) : (
            <ul className="space-y-1.5">
              {linkedin.slice(0, 8).map((r) => (
                <LinkedInRow key={r.touch.id} row={r} />
              ))}
            </ul>
          )}
        </Section>
        <Section
          title="Field route"
          accent="text-violet-400"
          icon={<MapPin className="h-3.5 w-3.5" />}
          count={drops.length}
        >
          {drops.length === 0 ? (
            <Empty msg="No drops today (Tue/Wed/Thu only)." />
          ) : (
            <ol className="space-y-1.5">
              {drops.slice(0, 12).map((r, i) => (
                <DropRow key={r.touch.id} row={r} idx={i + 1} />
              ))}
            </ol>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  accent,
  icon,
  count,
  children,
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className={accent}>{icon}</span>
          <span className="text-xs uppercase tracking-wider font-semibold">
            {title}
          </span>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {count}
        </Badge>
      </div>
      <div className="p-3">{children}</div>
    </Card>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center text-xs text-muted-foreground">
      <CheckCircle2 className="h-5 w-5 mb-1.5 opacity-50" />
      {msg}
    </div>
  );
}

function WarmRow({ row }: { row: Row }) {
  const a = row.account;
  return (
    <div className="group rounded-md border border-border/60 bg-card hover:bg-zinc-900/60 transition-colors">
      <div className="p-3 flex items-start gap-3">
        <div
          className={
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-mono font-semibold " +
            scoreColor(a.score ? Number(a.score) : null)
          }
        >
          {a.score ? Number(a.score).toFixed(0) : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
              className="font-semibold text-sm hover:text-emerald-400 transition-colors truncate"
            >
              {a.company}
            </Link>
            {a.primaryTrigger && (
              <span
                className={
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium " +
                  triggerColor(a.primaryTrigger)
                }
              >
                {a.primaryTrigger}
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {a.dmName && <span className="font-medium">{a.dmName}</span>}
            {a.phone && <span className="font-mono">{a.phone}</span>}
            {a.county && <span>{a.county}</span>}
            {a.ee && <span>{num(a.ee)} EE</span>}
          </div>
          {a.talkTrack && (
            <p className="text-[11px] text-zinc-400 mt-1.5 leading-relaxed line-clamp-2">
              {a.talkTrack}
            </p>
          )}
        </div>
        <RowActions row={row} />
      </div>
    </div>
  );
}

function EmailRow({ row }: { row: Row }) {
  const a = row.account;
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-900/60">
      <Mail className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <Link
          href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
          className="text-sm font-medium truncate hover:text-emerald-400 transition-colors"
        >
          {a.company}
        </Link>
        {a.dmEmail && (
          <span className="ml-2 font-mono text-[11px] text-muted-foreground truncate">
            {a.dmEmail}
          </span>
        )}
      </div>
      {a.dmEmail && (
        <a
          href={`mailto:${a.dmEmail}?subject=${encodeURIComponent("Quick question — " + a.company)}`}
          className="text-[11px] text-emerald-400 hover:underline"
        >
          Open
        </a>
      )}
      <RowActions row={row} compact />
    </li>
  );
}

function CallRow({ row }: { row: Row }) {
  const a = row.account;
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-900/60">
      <Phone className="h-3.5 w-3.5 text-amber-400 shrink-0" />
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <Link
          href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
          className="text-sm font-medium truncate hover:text-emerald-400 transition-colors"
        >
          {a.company}
        </Link>
        {a.dmName && (
          <span className="text-[11px] text-muted-foreground truncate">
            {a.dmName}
          </span>
        )}
      </div>
      {a.phone && (
        <a
          href={`tel:${a.phone}`}
          className="font-mono text-[11px] text-amber-400 hover:underline"
        >
          {a.phone}
        </a>
      )}
      <RowActions row={row} compact />
    </li>
  );
}

function LinkedInRow({ row }: { row: Row }) {
  const a = row.account;
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-900/60">
      <Linkedin className="h-3.5 w-3.5 text-blue-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <Link
          href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
          className="text-sm font-medium truncate hover:text-emerald-400 transition-colors"
        >
          {a.company}
        </Link>
      </div>
      {a.linkedinUrl && (
        <a
          href={a.linkedinUrl}
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-blue-400 hover:underline"
        >
          Open
        </a>
      )}
      <RowActions row={row} compact />
    </li>
  );
}

function DropRow({ row, idx }: { row: Row; idx: number }) {
  const a = row.account;
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-zinc-900/60">
      <span className="font-mono text-[10px] text-violet-400 w-4 text-center">
        {idx}
      </span>
      <Building2 className="h-3.5 w-3.5 text-violet-400 shrink-0" />
      <div className="flex-1 min-w-0 flex items-baseline gap-2">
        <Link
          href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
          className="text-sm font-medium truncate hover:text-emerald-400 transition-colors"
        >
          {a.company}
        </Link>
        {a.city && (
          <span className="text-[11px] text-muted-foreground">{a.city}</span>
        )}
      </div>
      <RowActions row={row} compact />
    </li>
  );
}

function RowActions({ row, compact }: { row: Row; compact?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const ctx = React.useContext(OptimisticCtx);
  return (
    <>
      <Button
        size={compact ? "sm" : "sm"}
        variant="ghost"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "h-6 px-1.5 text-[10px] text-emerald-400 hover:text-emerald-300"
            : "h-7 text-[11px] text-emerald-400 hover:text-emerald-300"
        }
      >
        <Activity className="h-3 w-3 mr-1" />
        Log
      </Button>
      <TouchLogger
        open={open}
        onOpenChange={setOpen}
        companyKey={
          row.account.companyKey ?? String(row.account.id ?? "")
        }
        company={row.account.company ?? row.account.name ?? ""}
        touchId={row.touch.id}
        defaultChannel={row.touch.channel ?? "call"}
        onOptimisticLog={ctx?.dispatch}
      />
    </>
  );
}
