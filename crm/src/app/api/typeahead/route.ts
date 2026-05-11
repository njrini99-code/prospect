import { requireAuth } from "@/lib/auth";
import { searchCompaniesTypeahead } from "@/lib/queries";

/**
 * v1.1 typeahead endpoint used by the Cmd+K palette for live search beyond
 * the indexed top-200 slice mounted with the app layout.
 */
export async function GET(req: Request) {
  await requireAuth();
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (q.trim().length < 2) {
    return Response.json({ results: [] });
  }
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const rows = await searchCompaniesTypeahead(q, limit);
  // Re-shape into the CommandAccount type the palette expects.
  const results = rows.map((r) => ({
    id: r.id,
    name: r.name,
    county: r.county,
    primaryTrigger: null,
    dmName: null,
    score: r.score,
  }));
  return Response.json({ results });
}
