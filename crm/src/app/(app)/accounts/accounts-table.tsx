"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import { Search, Filter, Bookmark, X } from "lucide-react";
import { Pagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn, num, scoreColor, triggerColor, statusColor } from "@/lib/utils";
import type { Account } from "@/db/schema";

const SAVED_VIEWS = [
  { id: "warm", label: "🔥 Warm", emoji: "🔥" },
  { id: "monday", label: "Mon batch" },
  { id: "trinet", label: "TriNet inc." },
  { id: "manufacturing", label: "Manufacturing" },
  { id: "engineering", label: "Engineering" },
];

export function AccountsTable({
  accounts,
  counties,
  triggers,
  page,
  pageSize,
  totalCount,
  hasNextPage,
  currentParams,
}: {
  accounts: Account[];
  counties: { county: string; n: number }[];
  triggers: { trigger: string; n: number }[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  currentParams: {
    q?: string;
    trigger?: string;
    county?: string;
    status?: string;
    view?: string;
  };
}) {
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [trigger, setTrigger] = useQueryState("trigger");
  const [county, setCounty] = useQueryState("county");
  const [view, setView] = useQueryState("view");

  // Server-side pagination: list comes pre-filtered + pre-paginated from the
  // page route. Local filter is gone — search/trigger/county are reflected
  // in the URL and round-trip to the server.
  const filtered = accounts;

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={q || ""}
              onChange={(e) => setQ(e.target.value || null)}
              placeholder="Search company, DM, city, county…"
              className="pl-8 h-8"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {SAVED_VIEWS.map((v) => (
              <Button
                key={v.id}
                size="sm"
                variant={view === v.id ? "default" : "outline"}
                onClick={() => setView(view === v.id ? null : v.id)}
                className="h-7 text-[11px]"
              >
                <Bookmark className="h-3 w-3 mr-1" />
                {v.label}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="h-3 w-3" /> Triggers:
          </div>
          {triggers.slice(0, 8).map((t) => (
            <button
              key={t.trigger}
              onClick={() =>
                setTrigger(trigger === t.trigger ? null : t.trigger)
              }
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-medium ring-1 transition-colors",
                trigger === t.trigger
                  ? "bg-emerald-500/20 text-emerald-300 ring-emerald-500/40"
                  : "bg-zinc-900 text-zinc-400 ring-zinc-800 hover:bg-zinc-800",
              )}
            >
              {t.trigger} <span className="opacity-50">{t.n}</span>
            </button>
          ))}
          {(trigger || county || view) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTrigger(null);
                setCounty(null);
                setView(null);
              }}
              className="h-6 text-[10px] text-muted-foreground"
            >
              <X className="h-3 w-3 mr-0.5" />
              Clear
            </Button>
          )}
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="max-h-[calc(100vh-280px)] overflow-auto scrollbar-thin">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Score</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="hidden md:table-cell">County</TableHead>
                <TableHead className="hidden lg:table-cell">EE</TableHead>
                <TableHead className="hidden md:table-cell">Trigger</TableHead>
                <TableHead className="hidden lg:table-cell">Incumbent</TableHead>
                <TableHead className="hidden lg:table-cell">DM</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-12 text-sm text-muted-foreground">
                    No accounts match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((a) => (
                <TableRow key={a.companyKey} className="group">
                  <TableCell>
                    <div
                      className={
                        "inline-flex h-7 w-7 items-center justify-center rounded-md text-xs font-mono font-semibold " +
                        scoreColor(a.score ? Number(a.score) : null)
                      }
                    >
                      {a.score ? Number(a.score).toFixed(0) : "—"}
                    </div>
                  </TableCell>
                  <TableCell>
                    <HoverCard openDelay={200}>
                      <HoverCardTrigger asChild>
                        <Link
                          href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
                          className="font-medium text-sm hover:text-emerald-400 transition-colors"
                        >
                          {a.company}
                        </Link>
                      </HoverCardTrigger>
                      <HoverCardContent align="start" className="w-96">
                        <AccountPreview a={a} />
                      </HoverCardContent>
                    </HoverCard>
                    <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
                      {a.city ?? ""}{a.zip ? ` · ${a.zip}` : ""}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-zinc-400">
                    {a.county || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs font-mono">
                    {num(a.ee)}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
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
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs text-zinc-400">
                    {a.incumbentPeo || "—"}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-xs">
                    {a.dmName || (
                      <span className="text-rose-400/80">no DM</span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {a.status && (
                      <Badge
                        className={
                          "text-[10px] font-medium ring-0 border-0 " +
                          statusColor(a.status)
                        }
                      >
                        {a.status}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        hasNextPage={hasNextPage}
        basePath="/accounts"
        preserveParams={currentParams}
      />
    </div>
  );
}

function AccountPreview({ a }: { a: Account }) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-semibold tracking-tight">{a.company}</span>
        <span
          className={
            "rounded-md px-1.5 py-0.5 text-[10px] font-mono font-semibold " +
            scoreColor(a.score ? Number(a.score) : null)
          }
        >
          {a.score ? Number(a.score).toFixed(0) : "—"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
        <Row k="County" v={a.county ?? "—"} />
        <Row k="EE" v={num(a.ee)} />
        <Row k="Trigger" v={a.primaryTrigger ?? "—"} />
        <Row k="Incumbent" v={a.incumbentPeo ?? "—"} />
        <Row k="DM" v={a.dmName ?? "—"} />
        <Row k="Phone" v={a.phone ?? "—"} mono />
        <Row k="Email" v={a.dmEmail ?? "—"} mono />
        <Row k="Multi-state" v={a.multiStateLikely ? "Yes" : "No"} />
      </div>
      {a.talkTrack && (
        <p className="text-[11px] text-muted-foreground border-t border-border/60 pt-2 leading-relaxed">
          {a.talkTrack}
        </p>
      )}
    </div>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-muted-foreground">{k}:</span>
      <span className={cn(mono && "font-mono")}>{v}</span>
    </div>
  );
}
