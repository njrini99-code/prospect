import { searchAccounts, countiesFacet, triggersFacet } from "@/lib/queries";
import { AccountsTable } from "./accounts-table";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{
  q?: string;
  trigger?: string;
  county?: string;
  status?: string;
  vertical?: string;
  view?: string;
  page?: string;
  hasHealth?: string;
  multiState?: string;
  growthTier?: string;
  minScore?: string;
  maxScore?: string;
  minEe?: string;
  maxEe?: string;
}>;

/**
 * Saved views — now target the master `companies` table rather than the
 * old `cadences` slice. "Has Health" filters companies.has_health_carriers=true,
 * Multi-State filters multi_state_likely=true, Monday route filters cadences
 * with route_day=0 (still backed by cadences for in-flight outreach).
 */
const SAVED_VIEWS: Record<
  string,
  {
    trigger?: string;
    status?: string;
    routeDay?: number;
    hasHealth?: boolean;
    multiState?: boolean;
    growthTier?: string;
    vertical?: string;
  }
> = {
  warm: { status: "warm_followup" },
  monday: { routeDay: 0 },
  trinet: { trigger: "displacement" },
  manufacturing: { vertical: "Manufacturing" },
  engineering: { vertical: "Engineering" },
  has_health: { hasHealth: true },
  multi_state: { multiState: true },
  rapid_growth: { growthTier: "RAPID" },
};

function n(v?: string) {
  if (!v) return undefined;
  const x = Number(v);
  return Number.isFinite(x) ? x : undefined;
}

function b(v?: string) {
  if (v === "true" || v === "1") return true;
  return undefined;
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const view = params.view ? SAVED_VIEWS[params.view] : undefined;
  const page = Math.max(1, Number(params.page ?? "1") || 1);

  const [accountsPage, counties, triggers] = await Promise.all([
    searchAccounts(
      {
        search: params.q,
        trigger: params.trigger ?? view?.trigger,
        county: params.county,
        status: params.status ?? view?.status,
        vertical: params.vertical ?? view?.vertical,
        routeDay: view?.routeDay,
        hasHealth: b(params.hasHealth) ?? view?.hasHealth,
        multiState: b(params.multiState) ?? view?.multiState,
        growthTier: params.growthTier ?? view?.growthTier,
        minScore: n(params.minScore),
        maxScore: n(params.maxScore),
        minEe: n(params.minEe),
        maxEe: n(params.maxEe),
      },
      page,
    ),
    countiesFacet(),
    triggersFacet(),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {accountsPage.totalCount.toLocaleString()} accounts in current view
          </p>
        </div>
      </div>
      <AccountsTable
        accounts={accountsPage.rows}
        counties={counties}
        triggers={triggers}
        page={accountsPage.page}
        pageSize={accountsPage.pageSize}
        totalCount={accountsPage.totalCount}
        hasNextPage={accountsPage.hasNextPage}
        currentParams={{
          q: params.q,
          trigger: params.trigger,
          county: params.county,
          status: params.status,
          view: params.view,
        }}
      />
    </div>
  );
}
