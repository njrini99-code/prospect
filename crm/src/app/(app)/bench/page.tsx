import {
  getBenchPage,
  countiesFacet,
  verticalsFacet,
} from "@/lib/queries";
import { BenchTable } from "./bench-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  page?: string;
  q?: string;
  county?: string;
  vertical?: string;
  hasHealth?: string;
  multiState?: string;
  growthTier?: string;
  minScore?: string;
  maxScore?: string;
  minEe?: string;
  maxEe?: string;
}>;

function n(v?: string) {
  if (!v) return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

function b(v?: string) {
  if (v === "true" || v === "1") return true;
  return undefined;
}

export default async function BenchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? "1") || 1);
  const filters = {
    search: params.q,
    county: params.county,
    vertical: params.vertical,
    hasHealth: b(params.hasHealth),
    multiState: b(params.multiState),
    growthTier: params.growthTier,
    minScore: n(params.minScore),
    maxScore: n(params.maxScore),
    minEe: n(params.minEe),
    maxEe: n(params.maxEe),
  };
  const [{ rows, totalCount, hasNextPage, pageSize }, counties, verticals] =
    await Promise.all([
      getBenchPage(filters, page),
      countiesFacet(),
      verticalsFacet(),
    ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Bench</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {totalCount.toLocaleString()} qualified prospects · promote to next
          Monday batch
        </p>
      </div>
      <BenchTable
        accounts={rows}
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        hasNextPage={hasNextPage}
        initialSearch={params.q ?? ""}
        counties={counties}
        verticals={verticals}
        currentFilters={{
          county: params.county,
          vertical: params.vertical,
          hasHealth: params.hasHealth,
          multiState: params.multiState,
          growthTier: params.growthTier,
          minScore: params.minScore,
          maxScore: params.maxScore,
        }}
      />
    </div>
  );
}
