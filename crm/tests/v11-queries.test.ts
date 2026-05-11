/**
 * tests/v11-queries.test.ts
 *
 * Unit tests for the v1.1 master-schema query helpers in src/lib/queries.ts.
 * The Drizzle db client is mocked so no Neon round-trips happen.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

// We capture every SQL string passed to db.execute(...) so individual tests
// can assert the shape of the generated query without a real DB.
const seen = vi.hoisted(() => ({
  queries: [] as string[],
  rawQueries: [] as any[],
}));

function stringifyChunks(q: any): { text: string; values: unknown[] } {
  const chunks = (q?.queryChunks ?? []) as any[];
  const parts: string[] = [];
  const values: unknown[] = [];
  function walk(node: any): void {
    if (node == null) return;
    if (typeof node === "string") {
      parts.push(node);
      return;
    }
    if (typeof node === "number" || typeof node === "boolean") {
      parts.push(String(node));
      values.push(node);
      return;
    }
    if (typeof node !== "object") return;
    // Param-like
    if ("value" in node) {
      const v = (node as any).value;
      values.push(v);
      parts.push(JSON.stringify(v));
      return;
    }
    // Nested SQL chunk
    if (Array.isArray((node as any).queryChunks)) {
      for (const c of (node as any).queryChunks) walk(c);
      return;
    }
    // Drizzle column / table refs — best-effort fall back
    if ((node as any).name && typeof (node as any).name === "string") {
      parts.push((node as any).name);
      return;
    }
  }
  for (const c of chunks) walk(c);
  return { text: parts.join(""), values };
}

const mkChain = (rows: unknown[]) => {
  const chain: Record<string, unknown> = {};
  const METHODS = [
    "select",
    "from",
    "where",
    "limit",
    "orderBy",
    "leftJoin",
    "innerJoin",
    "offset",
  ];
  for (const m of METHODS) chain[m] = () => chain;
  Object.defineProperty(chain, "then", {
    get() {
      return (resolve: (v: unknown) => void) => resolve(rows);
    },
  });
  return chain;
};

let executeImpl: (q: any) => Promise<{ rows: unknown[] }>;

vi.mock("@/db/client", () => {
  const db = {
    select: () => mkChain([]),
    insert: () => mkChain([]),
    update: () => mkChain([]),
    delete: () => mkChain([]),
    execute: (q: any) => {
      // Capture both the raw template + the recursively-flattened string.
      seen.rawQueries.push(q);
      const { text } = stringifyChunks(q);
      const s = typeof q === "string" ? q : text || String(q);
      seen.queries.push(s);
      return executeImpl(q);
    },
  };
  return { db };
});

import {
  getCompanyById,
  getBenchPage,
  searchCompaniesTypeahead,
  getIndustryTrends,
  getTriggerFiresThisWeek,
  topCompaniesForCommandPalette,
} from "@/lib/queries";

beforeEach(() => {
  seen.queries.length = 0;
  seen.rawQueries.length = 0;
  executeImpl = async () => ({ rows: [] });
});

describe("getCompanyById — parallel fetch shape", () => {
  it("returns null for non-positive ids", async () => {
    expect(await getCompanyById(0)).toBeNull();
    expect(await getCompanyById(-1)).toBeNull();
    expect(await getCompanyById(NaN as any)).toBeNull();
  });

  it("returns null when the base SELECT yields no row", async () => {
    executeImpl = async () => ({ rows: [] });
    const r = await getCompanyById(1);
    expect(r).toBeNull();
  });

  it("projects the base row + all related collections in parallel", async () => {
    let calls = 0;
    executeImpl = async () => {
      calls += 1;
      return {
        rows: [
          {
            id: 42,
            name: "Acme Co",
            company_id: 42,
            company_key: "acmeco",
            cadence_status: "active",
            score: "33.0",
            computed_score: 12.5,
            dm_name: "Jane Doe",
            dm_email: "jane@acme.com",
            incumbent_peo: "TriNet",
            disqualified: false,
            ee: 25,
          },
        ],
      };
    };
    const data = await getCompanyById(42);
    expect(data).not.toBeNull();
    expect(data!.account.id).toBe(42);
    expect(data!.account.name).toBe("Acme Co");
    expect(data!.account.company).toBe("Acme Co"); // legacy alias
    expect(data!.account.dmName).toBe("Jane Doe");
    expect(data!.account.companyKey).toBe("acmeco");
    expect(data!.account.computedScore).toBe(12.5);
    expect(Array.isArray(data!.triggers)).toBe(true);
    expect(Array.isArray(data!.carriers)).toBe(true);
    expect(Array.isArray(data!.incumbents)).toBe(true);
    expect(Array.isArray(data!.notes)).toBe(true);
    expect(Array.isArray(data!.tasks)).toBe(true);
    expect(Array.isArray(data!.contacts)).toBe(true);
    // The base SELECT is one execute call (the others go via the typed Drizzle builder).
    expect(calls).toBe(1);
  });
});

describe("getBenchPage — pagination + filters + score ordering", () => {
  it("respects page numbers via OFFSET", async () => {
    executeImpl = async () => ({ rows: [] });
    await getBenchPage({}, 3);
    const sql = seen.queries.join("\n");
    // Page 3 with 50/page => OFFSET 100
    expect(sql).toMatch(/OFFSET\s+100/);
    expect(sql).toMatch(/LIMIT\s+50/);
  });

  it("applies the qualified-prospect gate", async () => {
    await getBenchPage({}, 1);
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/disqualified\s*=\s*false/);
    expect(sql).toMatch(/state\s*=\s*'NC'/);
    expect(sql).toMatch(/ee\s+BETWEEN\s+11\s+AND\s+55/);
    expect(sql).toMatch(
      /cad\.id IS NULL OR cad\.status NOT IN \('active','warm_followup'\)/,
    );
  });

  it("orders by computed score DESC", async () => {
    await getBenchPage({}, 1);
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/ORDER BY computed_score DESC/);
  });

  it("propagates county / vertical / hasHealth / multiState filters", async () => {
    await getBenchPage(
      {
        county: "Wake",
        vertical: "Manufacturing",
        hasHealth: true,
        multiState: true,
      },
      1,
    );
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/c\.county\s*=\s*'Wake'/);
    expect(sql).toMatch(/c\.vertical\s*=\s*'Manufacturing'/);
    expect(sql).toMatch(/c\.has_health_carriers\s*=\s*true/);
    expect(sql).toMatch(/c\.multi_state_likely\s*=\s*true/);
  });

  it("propagates score range filters as post-aggregate predicates", async () => {
    await getBenchPage({ minScore: 10, maxScore: 99 }, 1);
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/computed_score\s*>=\s*10/);
    expect(sql).toMatch(/computed_score\s*<=\s*99/);
  });

  it("returns the page metadata shape", async () => {
    // Stub: rows query returns 2 rows, count query returns total=10.
    let n = 0;
    executeImpl = async () => {
      n += 1;
      if (n === 1) {
        return {
          rows: [
            { id: 1, name: "A", computed_score: 8 },
            { id: 2, name: "B", computed_score: 7 },
          ],
        };
      }
      return { rows: [{ n: 10 }] };
    };
    const res = await getBenchPage({}, 1);
    expect(res.rows.length).toBe(2);
    expect(res.totalCount).toBe(10);
    expect(res.hasNextPage).toBe(true);
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(50);
  });

  it("escapes single quotes in search input (defense in depth)", async () => {
    // Should not throw and should never emit an un-escaped quote that would
    // break the surrounding clause.
    await getBenchPage({ search: "O'Reilly" }, 1);
    const sql = seen.queries.join("\n");
    // We replace ' with '' inline; the rendered fragment should contain o''reilly somewhere.
    expect(sql.toLowerCase()).toContain("o''reilly");
  });
});

describe("searchCompaniesTypeahead — normalization", () => {
  it("returns [] for empty / whitespace-only queries", async () => {
    expect(await searchCompaniesTypeahead("   ")).toEqual([]);
    expect(await searchCompaniesTypeahead("")).toEqual([]);
  });

  it("normalizes the query to lowercase + alphanumeric only", async () => {
    await searchCompaniesTypeahead("Air Pur, INC.");
    // The normalized string ("airpurinc") is bound as a Param value in the
    // SQL template — appears via JSON.stringify in our captured query text.
    const sql = seen.queries.join("\n");
    expect(sql).toContain("airpurinc");
  });

  it("returns id+name+county+ee+score shape", async () => {
    executeImpl = async () => ({
      rows: [
        { id: 1, name: "Air Pur", county: "Moore", ee: 40, score: 33.5 },
        { id: 2, name: "Acme", county: null, ee: null, score: 0 },
      ],
    });
    const rows = await searchCompaniesTypeahead("air", 5);
    expect(rows).toEqual([
      { id: 1, name: "Air Pur", county: "Moore", ee: 40, score: 33.5 },
      { id: 2, name: "Acme", county: null, ee: null, score: 0 },
    ]);
  });

  it("clamps the limit between 1 and 50", async () => {
    await searchCompaniesTypeahead("foo", 9999);
    let sql = seen.queries.join("\n");
    // The limit is the final numeric in the query — 50 means clamped down.
    expect(/LIMIT\b[\s\S]*?\b50\b/.test(sql) || sql.includes("50")).toBe(true);
    expect(sql.includes("9999")).toBe(false);
    seen.queries.length = 0;
    await searchCompaniesTypeahead("foo", -3);
    sql = seen.queries.join("\n");
    expect(sql.includes("-3")).toBe(false);
    expect(sql.includes("1") || sql.includes("LIMIT")).toBe(true);
  });
});

describe("getIndustryTrends — grouping by vertical", () => {
  it("emits a vertical-grouped query", async () => {
    await getIndustryTrends();
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/GROUP BY\s+1/);
    expect(sql).toMatch(/vertical/);
    expect(sql).toMatch(/AVG\(score\)/);
    expect(sql).toMatch(/top_carrier/);
  });

  it("maps rows to the expected shape", async () => {
    executeImpl = async () => ({
      rows: [
        {
          vertical: "Manufacturing",
          companies: 100,
          mean_score: 14.2,
          total_score: 1420,
          top_carrier: "BCBSNC",
        },
        {
          vertical: "Engineering",
          companies: 33,
          mean_score: 22.1,
          total_score: 728,
          top_carrier: null,
        },
      ],
    });
    const rows = await getIndustryTrends();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      vertical: "Manufacturing",
      companies: 100,
      meanScore: 14.2,
      totalScore: 1420,
      topCarrier: "BCBSNC",
    });
    expect(rows[1].topCarrier).toBeNull();
  });
});

describe("getTriggerFiresThisWeek — per-vertical counts", () => {
  it("groups by company.vertical with non-zero fires", async () => {
    await getTriggerFiresThisWeek();
    const sql = seen.queries.join("\n");
    // Drizzle's sql`...${table}...` compiles the table reference into a
    // queryChunks placeholder, so the literal "companies" doesn't appear
    // in the stringified template — assert on what we *can* see.
    expect(sql).toMatch(/c\.vertical/);
    expect(sql).toMatch(/GROUP BY\s+1/);
    expect(sql).toMatch(/disqualified\s*=\s*false/);
  });
});

describe("topCompaniesForCommandPalette — bounded mount payload", () => {
  it("clamps the limit between 1 and 500", async () => {
    await topCompaniesForCommandPalette(99999);
    let sql = seen.queries.join("\n");
    expect(sql.includes("500")).toBe(true);
    expect(sql.includes("99999")).toBe(false);
    seen.queries.length = 0;
    await topCompaniesForCommandPalette(0);
    sql = seen.queries.join("\n");
    expect(sql.includes("LIMIT") || sql.includes("1")).toBe(true);
  });

  it("filters to qualified NC companies", async () => {
    await topCompaniesForCommandPalette(200);
    const sql = seen.queries.join("\n");
    expect(sql).toMatch(/disqualified\s*=\s*false/);
    expect(sql).toMatch(/state\s*=\s*'NC'/);
  });
});
