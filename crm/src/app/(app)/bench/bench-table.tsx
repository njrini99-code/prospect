"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { Search, Plus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/ui/pagination";
import { scoreColor, triggerColor, num } from "@/lib/utils";
import { promoteToActive } from "@/app/actions";
import type { Account } from "@/db/schema";

type BenchFilters = {
  county?: string;
  vertical?: string;
  hasHealth?: string;
  multiState?: string;
  growthTier?: string;
  minScore?: string;
  maxScore?: string;
};

export function BenchTable({
  accounts,
  page,
  pageSize,
  totalCount,
  hasNextPage,
  initialSearch,
  counties = [],
  verticals = [],
  currentFilters = {},
}: {
  accounts: Account[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  initialSearch: string;
  counties?: { county: string; n: number }[];
  verticals?: { vertical: string; n: number }[];
  currentFilters?: BenchFilters;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(initialSearch);
  const [pending, start] = useTransition();
  const [promoting, setPromoting] = React.useState<string | null>(null);

  const buildUsp = React.useCallback(
    (overrides: Partial<BenchFilters> & { q?: string } = {}) => {
      const usp = new URLSearchParams();
      const next = { q: q || undefined, ...currentFilters, ...overrides };
      Object.entries(next).forEach(([k, v]) => {
        if (v != null && v !== "") usp.set(k, String(v));
      });
      return usp;
    },
    [q, currentFilters],
  );

  // Debounce search -> push to URL so the server query gets the new value
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (q === initialSearch) return;
      const usp = buildUsp({ q: q || undefined });
      router.replace(`/bench${usp.toString() ? `?${usp.toString()}` : ""}`);
    }, 250);
    return () => clearTimeout(t);
  }, [q, initialSearch, router, buildUsp]);

  const setFilter = (key: keyof BenchFilters, value: string | undefined) => {
    const usp = buildUsp({ [key]: value } as any);
    if (!value) usp.delete(key);
    router.replace(`/bench${usp.toString() ? `?${usp.toString()}` : ""}`);
  };

  const promote = (a: Account) => {
    const key = a.companyKey ?? (a.id != null ? String(a.id) : null);
    if (!key) return;
    setPromoting(key);
    start(async () => {
      try {
        await promoteToActive(a.id ?? key);
        toast.success("Promoted to active", {
          description: a.company ?? a.name ?? undefined,
        });
      } catch (e: any) {
        toast.error("Failed", { description: e?.message });
      } finally {
        setPromoting(null);
      }
    });
  };

  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-2">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bench…"
            className="pl-8 h-8"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterSelect
            label="County"
            value={currentFilters.county}
            onChange={(v) => setFilter("county", v)}
            options={counties
              .slice(0, 25)
              .map((c) => ({ value: c.county, label: `${c.county} (${c.n})` }))}
          />
          <FilterSelect
            label="Vertical"
            value={currentFilters.vertical}
            onChange={(v) => setFilter("vertical", v)}
            options={verticals
              .slice(0, 25)
              .map((v) => ({ value: v.vertical, label: `${v.vertical} (${v.n})` }))}
          />
          <FilterToggle
            label="Has health"
            active={currentFilters.hasHealth === "true"}
            onToggle={() =>
              setFilter(
                "hasHealth",
                currentFilters.hasHealth === "true" ? undefined : "true",
              )
            }
          />
          <FilterToggle
            label="Multi-state"
            active={currentFilters.multiState === "true"}
            onToggle={() =>
              setFilter(
                "multiState",
                currentFilters.multiState === "true" ? undefined : "true",
              )
            }
          />
          <FilterSelect
            label="Growth"
            value={currentFilters.growthTier}
            onChange={(v) => setFilter("growthTier", v)}
            options={[
              { value: "RAPID", label: "Rapid" },
              { value: "STRONG", label: "Strong" },
              { value: "MODERATE", label: "Moderate" },
              { value: "STABLE", label: "Stable" },
              { value: "FLAT", label: "Flat" },
            ]}
          />
          <FilterSelect
            label="Min score"
            value={currentFilters.minScore}
            onChange={(v) => setFilter("minScore", v)}
            options={[
              { value: "5", label: "5+" },
              { value: "10", label: "10+" },
              { value: "20", label: "20+" },
              { value: "40", label: "40+" },
            ]}
          />
        </div>
      </Card>
      <Card className="p-0 overflow-hidden">
        <div className="divide-y divide-border/40">
          {accounts.length === 0 && (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              No accounts on this page.
            </div>
          )}
          {accounts.map((a) => (
            <div
              key={a.id ?? a.companyKey}
              className="px-3 py-2 flex items-center gap-3 hover:bg-zinc-900/40"
            >
              <div
                className={
                  "h-7 w-7 rounded-md flex items-center justify-center text-xs font-mono font-semibold shrink-0 " +
                  scoreColor(a.score ? Number(a.score) : null)
                }
              >
                {a.score ? Number(a.score).toFixed(0) : "—"}
              </div>
              <div className="flex-1 min-w-0">
                <Link
                  href={`/accounts/${a.id ?? encodeURIComponent(a.companyKey ?? "")}`}
                  className="font-medium text-sm hover:text-emerald-400 transition-colors truncate block"
                >
                  {a.company ?? a.name ?? "—"}
                </Link>
                <div className="text-[10px] text-muted-foreground font-mono truncate">
                  {a.county ?? "—"} · {num(a.ee)} EE
                  {a.incumbentPeo ? ` · inc: ${a.incumbentPeo}` : ""}
                </div>
              </div>
              {a.primaryTrigger && (
                <span
                  className={
                    "rounded-md px-1.5 py-0.5 text-[10px] font-medium shrink-0 " +
                    triggerColor(a.primaryTrigger)
                  }
                >
                  {a.primaryTrigger}
                </span>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => promote(a)}
                disabled={
                  promoting === (a.companyKey ?? String(a.id ?? "")) || pending
                }
                className="h-7 text-[11px] shrink-0"
              >
                <Plus className="h-3 w-3" />
                Add to Mon batch
              </Button>
            </div>
          ))}
        </div>
      </Card>
      <Pagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        hasNextPage={hasNextPage}
        basePath="/bench"
        preserveParams={{ q: q || undefined, ...currentFilters }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || undefined)}
      className={
        "h-7 rounded-md border border-border bg-zinc-900/40 px-2 text-[11px] font-medium text-zinc-200 " +
        (value
          ? "ring-1 ring-emerald-500/40 text-emerald-300"
          : "text-muted-foreground")
      }
    >
      <option value="">{label}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function FilterToggle({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={
        "h-7 rounded-md border px-2 text-[11px] font-medium transition-colors " +
        (active
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
          : "border-border bg-zinc-900/40 text-muted-foreground hover:text-zinc-200")
      }
    >
      {label}
    </button>
  );
}
