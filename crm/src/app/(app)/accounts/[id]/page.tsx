import { notFound } from "next/navigation";
import {
  getAccount,
  getCompanyById,
  getTouchesForAccount,
  getOutcomesForAccount,
  getMeddpicc,
  getBuyerCast,
} from "@/lib/queries";
import { AccountHeader } from "./account-header";
import { AccountTabs } from "./account-tabs";
import { ScoreBreakdown } from "./score-breakdown";
import { SignalsAndCarriers } from "./signals-and-carriers";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export default async function AccountPage({ params }: { params: Params }) {
  const { id } = await params;
  const decoded = decodeURIComponent(id);

  // Resolve as company_id first; fall back to legacy company_key.
  let bundle: Awaited<ReturnType<typeof getCompanyById>> = null;
  if (/^\d+$/.test(decoded)) {
    bundle = await getCompanyById(Number(decoded));
  }
  if (!bundle) {
    const acct = await getAccount(decoded);
    if (!acct) return notFound();
    // Rebuild a bundle from the legacy projection
    const cid = acct.id;
    if (cid != null) {
      bundle = await getCompanyById(cid);
    } else {
      // truly nothing — fall back to empty relations
      bundle = {
        account: acct as any,
        triggers: [],
        carriers: [],
        incumbents: [],
        notes: [],
        tasks: [],
        contacts: [],
      };
    }
  }

  if (!bundle) return notFound();

  const account = bundle.account;
  const companyKey = account.companyKey ?? String(account.id ?? "");

  // Touches / outcomes / meddpicc / buyer_cast in parallel
  const [touchHistory, outcomes, mp, bc] = await Promise.all([
    getTouchesForAccount(account.id ?? companyKey),
    getOutcomesForAccount(account.id ?? companyKey),
    getMeddpicc(account.id ?? companyKey),
    getBuyerCast(account.id ?? companyKey),
  ]);

  return (
    <div className="space-y-4">
      <AccountHeader account={account} />
      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-4">
          <AccountTabs
            account={account}
            touches={touchHistory}
            outcomes={outcomes}
            meddpicc={mp}
            buyerCast={bc}
            notes={bundle.notes}
            tasks={bundle.tasks}
          />
          <SignalsAndCarriers
            triggers={bundle.triggers}
            carriers={bundle.carriers}
            incumbents={bundle.incumbents}
          />
        </div>
        <ScoreBreakdown account={account} />
      </div>
    </div>
  );
}
