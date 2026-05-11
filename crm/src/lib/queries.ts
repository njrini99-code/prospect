import "server-only";
import { db } from "@/db/client";
import {
  companies,
  contacts,
  carriers,
  triggers as triggersTable,
  incumbentPeo,
  cadences,
  touches,
  outcomesLedger,
  meddpicc,
  buyerCast,
  notes,
  tasks,
  channelBrokers,
  weightsCurrent,
  type AccountSummary,
} from "@/db/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNull,
  lte,
  ne,
  or,
  sql,
  inArray,
} from "drizzle-orm";
import { format, subDays } from "date-fns";

// ----------------------------------------------------------------------------
// Shared shape — collapses the master + cadence + contact join into the
// `AccountSummary` view-model the legacy UI was already wired against.
// ----------------------------------------------------------------------------

type AccountProjection = {
  // Master
  id: number;
  name: string | null;
  companyId?: number | null;
  city: string | null;
  county: string | null;
  state: string | null;
  zip: string | null;
  ein?: string | null;
  domain?: string | null;
  website: string | null;
  linkedinUrl: string | null;
  naics: string | null;
  vertical: string | null;
  ee: number | null;
  multiStateLikely: boolean | null;
  fedContractor?: boolean | null;
  has5500?: boolean | null;
  hasHealthCarriers: boolean | null;
  growthSignal: string | null;
  pitchSignal: string | null;
  pitchAngle: string | null;
  disqualified: boolean | null;
  disqualifiedReason?: string | null;
  source?: string | null;
  // Cadence overlay
  companyKey: string | null;
  status: string | null;
  primaryTrigger: string | null;
  routeDay: number | null;
  score: string | number | null;
  scoreRaw: string | number | null;
  scoreOverlay: string | number | null;
  weightMult: string | number | null;
  startDate: string | Date | null;
  tier: string | null;
  fitnessTier: string | null;
  enrichmentNotes: string | null;
  evidence: string | null;
  talkTrack: string | null;
  // Contact overlay
  dmName: string | null;
  dmTitle: string | null;
  dmEmail: string | null;
  phone: string | null;
  // Convenience aliases for the legacy UI
  company: string | null;
  hasHealthBenefits: boolean | null;
  growthTier: string | null;
  // Computed
  computedScore: number | null;
  incumbentPeo: string | null;
  incumbentStale: boolean | null;
};

// Postgres expression that sums currently-active trigger scores per company.
// "Active" is best-effort: triggers don't carry a `still_active` column, so we
// treat any trigger as currently active (matching the migration spec).
const COMPUTED_SCORE_SQL = sql<number>`(
  SELECT COALESCE(SUM(${triggersTable.score})::numeric, 0)::float
  FROM ${triggersTable}
  WHERE ${triggersTable.companyId} = ${companies.id}
)`;

const PRIMARY_CONTACT_SUBQUERY = {
  dmName: sql<string | null>`(
    SELECT name FROM ${contacts}
    WHERE ${contacts.companyId} = ${companies.id}
      AND ${contacts.isPrimary} = true
    LIMIT 1
  )`.as("dm_name"),
  dmTitle: sql<string | null>`(
    SELECT title FROM ${contacts}
    WHERE ${contacts.companyId} = ${companies.id}
      AND ${contacts.isPrimary} = true
    LIMIT 1
  )`.as("dm_title"),
  dmEmail: sql<string | null>`(
    SELECT email FROM ${contacts}
    WHERE ${contacts.companyId} = ${companies.id}
      AND ${contacts.isPrimary} = true
    LIMIT 1
  )`.as("dm_email"),
  phone: sql<string | null>`(
    SELECT phone FROM ${contacts}
    WHERE ${contacts.companyId} = ${companies.id}
      AND ${contacts.isPrimary} = true
    LIMIT 1
  )`.as("dm_phone"),
};

const INCUMBENT_PEO_SUBQUERY = sql<string | null>`(
  SELECT peo_brand FROM ${incumbentPeo}
  WHERE ${incumbentPeo.companyId} = ${companies.id}
  ORDER BY observed_at DESC NULLS LAST
  LIMIT 1
)`.as("incumbent_peo");

function rowsOf(r: any): any[] {
  return Array.isArray(r) ? r : (r?.rows ?? []);
}

function mapProjection(r: any): AccountProjection {
  const score = r.score ?? r.computed_score ?? r.computedScore ?? null;
  return {
    id: Number(r.id),
    name: r.name ?? null,
    companyId: r.company_id ?? r.companyId ?? r.id ?? null,
    city: r.city ?? null,
    county: r.county ?? null,
    state: r.state ?? null,
    zip: r.zip ?? null,
    ein: r.ein ?? null,
    domain: r.domain ?? null,
    website: r.website ?? null,
    linkedinUrl: r.linkedin_url ?? r.linkedinUrl ?? null,
    naics: r.naics ?? null,
    vertical: r.cadence_vertical ?? r.vertical ?? null,
    ee: r.ee == null ? null : Number(r.ee),
    multiStateLikely: r.multi_state_likely ?? r.multiStateLikely ?? null,
    fedContractor: r.fed_contractor ?? r.fedContractor ?? null,
    has5500: r.has_5500 ?? r.has5500 ?? null,
    hasHealthCarriers: r.has_health_carriers ?? r.hasHealthCarriers ?? null,
    growthSignal: r.growth_signal ?? r.growthSignal ?? null,
    pitchSignal: r.pitch_signal ?? r.pitchSignal ?? null,
    pitchAngle: r.pitch_angle ?? r.pitchAngle ?? null,
    disqualified: r.disqualified ?? null,
    disqualifiedReason: r.disqualified_reason ?? r.disqualifiedReason ?? null,
    source: r.source ?? null,
    companyKey: r.company_key ?? r.companyKey ?? null,
    status: r.cadence_status ?? r.status ?? null,
    primaryTrigger: r.primary_trigger ?? r.primaryTrigger ?? null,
    routeDay: r.route_day ?? r.routeDay ?? null,
    score: score,
    scoreRaw: r.score_raw ?? r.scoreRaw ?? null,
    scoreOverlay: r.score_overlay ?? r.scoreOverlay ?? null,
    weightMult: r.weight_mult ?? r.weightMult ?? null,
    startDate: r.start_date ?? r.startDate ?? null,
    tier: r.tier ?? null,
    fitnessTier: r.fitness_tier ?? r.fitnessTier ?? null,
    enrichmentNotes: r.enrichment_notes ?? r.enrichmentNotes ?? null,
    evidence: r.evidence ?? null,
    talkTrack: r.talk_track ?? r.talkTrack ?? null,
    dmName: r.dm_name ?? r.dmName ?? null,
    dmTitle: r.dm_title ?? r.dmTitle ?? null,
    dmEmail: r.dm_email ?? r.dmEmail ?? null,
    phone: r.dm_phone ?? r.phone ?? null,
    company: r.name ?? null, // alias
    hasHealthBenefits: r.has_health_carriers ?? r.hasHealthCarriers ?? null,
    growthTier: r.growth_signal ?? r.growthSignal ?? null,
    computedScore:
      r.computed_score == null
        ? null
        : Number(r.computed_score),
    incumbentPeo: r.incumbent_peo ?? r.incumbentPeo ?? null,
    incumbentStale: false,
  };
}

// ----------------------------------------------------------------------------
// Accounts list (Accounts page) — backed by `companies` joined with cadence
// ----------------------------------------------------------------------------

export type AccountFilters = {
  search?: string;
  trigger?: string;
  county?: string;
  status?: string;
  routeDay?: number;
  vertical?: string;
  hasHealth?: boolean;
  multiState?: boolean;
  growthTier?: string;
  minScore?: number;
  maxScore?: number;
  minEe?: number;
  maxEe?: number;
};

const PAGE_SIZE = 50;

export type PageResult<T> = {
  rows: T[];
  totalCount: number;
  hasNextPage: boolean;
  page: number;
  pageSize: number;
};

function buildAccountsWhere(filters: AccountFilters): string {
  const clauses: string[] = ["c.disqualified = false", "c.state = 'NC'"];

  if (filters.search) {
    const q = filters.search.toLowerCase().replace(/'/g, "''");
    clauses.push(
      `(LOWER(c.name) LIKE '%${q}%' OR c.name_normalized LIKE '%${q.replace(/[^a-z0-9]/g, "")}%')`,
    );
  }
  if (filters.county) {
    clauses.push(`c.county = '${filters.county.replace(/'/g, "''")}'`);
  }
  if (filters.vertical) {
    clauses.push(`c.vertical = '${filters.vertical.replace(/'/g, "''")}'`);
  }
  if (filters.hasHealth) clauses.push("c.has_health_carriers = true");
  if (filters.multiState) clauses.push("c.multi_state_likely = true");
  if (filters.growthTier) {
    clauses.push(
      `c.growth_signal = '${filters.growthTier.replace(/'/g, "''")}'`,
    );
  }
  if (filters.minEe != null) clauses.push(`c.ee >= ${Number(filters.minEe)}`);
  if (filters.maxEe != null) clauses.push(`c.ee <= ${Number(filters.maxEe)}`);
  if (filters.trigger) {
    clauses.push(
      `EXISTS (SELECT 1 FROM triggers t WHERE t.company_id = c.id AND t.trigger_type = '${filters.trigger.replace(/'/g, "''")}')`,
    );
  }
  if (filters.status) {
    const s = filters.status.replace(/'/g, "''");
    if (s === "bench") {
      clauses.push("(cad.status IS NULL OR cad.status NOT IN ('active','warm_followup'))");
    } else if (s === "active") {
      clauses.push("cad.status IN ('active','warm_followup')");
    } else {
      clauses.push(`cad.status = '${s}'`);
    }
  }
  if (filters.routeDay != null) {
    clauses.push(`cad.route_day = ${Number(filters.routeDay)}`);
  }
  if (filters.minScore != null) {
    clauses.push(`computed_score >= ${Number(filters.minScore)}`);
  }
  if (filters.maxScore != null) {
    clauses.push(`computed_score <= ${Number(filters.maxScore)}`);
  }

  return clauses.join(" AND ");
}

/**
 * Paginated account search — drives /accounts.
 *
 * Always projects from `companies` (the master table) joined to an optional
 * active cadence. Filters that touch computed_score are applied AFTER the
 * subquery so they don't break the GROUP BY.
 */
export async function searchAccounts(
  filters: AccountFilters = {},
  page = 1,
): Promise<PageResult<AccountProjection>> {
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);
  // computed_score depends on triggers — compute it as a LATERAL subquery so
  // we can both ORDER BY and (optionally) filter on it.
  const where = buildAccountsWhere(filters);

  const baseQuery = sql.raw(`
    SELECT
      c.id, c.name, c.name_normalized, c.city, c.county, c.state, c.zip,
      c.ein, c.domain, c.website, c.linkedin_url, c.naics, c.vertical,
      c.ee, c.multi_state_likely, c.fed_contractor, c.has_5500,
      c.has_health_carriers, c.growth_signal, c.pitch_signal, c.pitch_angle,
      c.disqualified, c.disqualified_reason, c.source,
      cad.company_key, cad.status AS cadence_status, cad.primary_trigger,
      cad.route_day, cad.score, cad.score_raw, cad.score_overlay,
      cad.weight_mult, cad.start_date, cad.tier, cad.fitness_tier,
      cad.enrichment_notes, cad.evidence, cad.talk_track,
      cad.vertical AS cadence_vertical,
      (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
      (SELECT title FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_title,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_email,
      (SELECT phone FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_phone,
      (SELECT peo_brand FROM incumbent_peo WHERE company_id = c.id ORDER BY observed_at DESC NULLS LAST LIMIT 1) AS incumbent_peo,
      COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
    FROM companies c
    LEFT JOIN cadences cad ON cad.company_id = c.id
    WHERE ${where}
    ORDER BY COALESCE(cad.score::float, computed_score) DESC NULLS LAST, c.id ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `);
  const countQuery = sql.raw(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT c.id,
             COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
      FROM companies c
      LEFT JOIN cadences cad ON cad.company_id = c.id
      WHERE ${where}
    ) sub
  `);

  const [rowsRes, countRes] = await Promise.all([
    db.execute(baseQuery),
    db.execute(countQuery),
  ]);
  const rows = rowsOf(rowsRes).map(mapProjection);
  const totalCount = Number(rowsOf(countRes)[0]?.n ?? 0);
  return {
    rows,
    totalCount,
    hasNextPage: offset + rows.length < totalCount,
    page,
    pageSize: PAGE_SIZE,
  };
}

// ----------------------------------------------------------------------------
// Account detail — getCompanyById / getAccount
// ----------------------------------------------------------------------------

/**
 * Full account record with parallel joins to all related entities.
 * Implements the v1.1 contract from the work order.
 */
export async function getCompanyById(id: number) {
  const idInt = Number(id);
  if (!Number.isFinite(idInt) || idInt <= 0) return null;

  const baseQuery = sql.raw(`
    SELECT
      c.*,
      cad.id AS cadence_id, cad.company_key, cad.status AS cadence_status,
      cad.primary_trigger, cad.route_day, cad.score, cad.score_raw,
      cad.score_overlay, cad.weight_mult, cad.start_date, cad.tier,
      cad.fitness_tier, cad.enrichment_notes, cad.evidence, cad.talk_track,
      cad.vertical AS cadence_vertical,
      (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
      (SELECT title FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_title,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_email,
      (SELECT phone FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_phone,
      (SELECT peo_brand FROM incumbent_peo WHERE company_id = c.id ORDER BY observed_at DESC NULLS LAST LIMIT 1) AS incumbent_peo,
      COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
    FROM companies c
    LEFT JOIN cadences cad ON cad.company_id = c.id
    WHERE c.id = ${idInt}
    LIMIT 1
  `);

  // PARALLEL fetches — id-scoped queries that don't need to wait on the base
  const [
    baseRes,
    triggerRows,
    carrierRows,
    incumbentRows,
    noteRows,
    taskRows,
    contactRows,
  ] = await Promise.all([
    db.execute(baseQuery),
    db
      .select()
      .from(triggersTable)
      .where(eq(triggersTable.companyId, idInt))
      .orderBy(desc(triggersTable.score), desc(triggersTable.triggerDate)),
    db
      .select()
      .from(carriers)
      .where(eq(carriers.companyId, idInt))
      .orderBy(desc(carriers.planYear)),
    db
      .select()
      .from(incumbentPeo)
      .where(eq(incumbentPeo.companyId, idInt))
      .orderBy(desc(incumbentPeo.observedAt)),
    db
      .select()
      .from(notes)
      .where(eq(notes.companyId, idInt))
      .orderBy(desc(notes.createdAt)),
    db
      .select()
      .from(tasks)
      .where(eq(tasks.companyId, idInt))
      .orderBy(asc(tasks.dueDate)),
    db
      .select()
      .from(contacts)
      .where(eq(contacts.companyId, idInt))
      .orderBy(desc(contacts.isPrimary)),
  ]);
  const base = rowsOf(baseRes)[0];
  if (!base) return null;
  const account = mapProjection(base);

  return {
    account,
    triggers: triggerRows,
    carriers: carrierRows,
    incumbents: incumbentRows,
    notes: noteRows,
    tasks: taskRows,
    contacts: contactRows,
  };
}

// Legacy convenience — accept either a company_key (text) OR an integer id.
export async function getAccount(idOrKey: string | number) {
  const numId = typeof idOrKey === "number" ? idOrKey : Number(idOrKey);
  if (Number.isFinite(numId) && numId > 0 && /^\d+$/.test(String(idOrKey))) {
    const data = await getCompanyById(numId);
    return data?.account ?? null;
  }
  // Fallback: legacy lookup by cadences.company_key
  const key = String(idOrKey);
  const res = await db.execute(sql.raw(`
    SELECT c.*, cad.company_key, cad.status AS cadence_status,
           cad.primary_trigger, cad.route_day, cad.score, cad.score_raw,
           cad.score_overlay, cad.weight_mult, cad.start_date, cad.tier,
           cad.fitness_tier, cad.enrichment_notes, cad.evidence, cad.talk_track,
           cad.vertical AS cadence_vertical,
           (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
           (SELECT title FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_title,
           (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_email,
           (SELECT phone FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_phone,
           (SELECT peo_brand FROM incumbent_peo WHERE company_id = c.id ORDER BY observed_at DESC NULLS LAST LIMIT 1) AS incumbent_peo,
           COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
    FROM cadences cad
    JOIN companies c ON c.id = cad.company_id
    WHERE cad.company_key = '${key.replace(/'/g, "''")}'
    LIMIT 1
  `));
  const row = rowsOf(res)[0];
  return row ? mapProjection(row) : null;
}

// ----------------------------------------------------------------------------
// Cadence-related touches + outcomes (back-compat helpers)
// ----------------------------------------------------------------------------

async function resolveCadenceIdByCompany(idOrKey: string | number) {
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    const r = await db
      .select({ id: cadences.id })
      .from(cadences)
      .where(eq(cadences.companyId, Number(idOrKey)))
      .limit(1);
    return r[0]?.id ?? null;
  }
  const r = await db
    .select({ id: cadences.id })
    .from(cadences)
    .where(eq(cadences.companyKey, String(idOrKey)))
    .limit(1);
  return r[0]?.id ?? null;
}

export async function getTouchesForAccount(idOrKey: string | number) {
  const cadenceId = await resolveCadenceIdByCompany(idOrKey);
  if (cadenceId == null) return [];
  return db
    .select()
    .from(touches)
    .where(eq(touches.cadenceId, cadenceId))
    .orderBy(asc(touches.scheduledFor));
}

export async function getOutcomesForAccount(idOrKey: string | number) {
  // outcomes_ledger has both cadence_id and company_key
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    const cadenceId = await resolveCadenceIdByCompany(idOrKey);
    if (cadenceId == null) return [];
    return db
      .select()
      .from(outcomesLedger)
      .where(eq(outcomesLedger.cadenceId, cadenceId))
      .orderBy(desc(outcomesLedger.loggedAt));
  }
  return db
    .select()
    .from(outcomesLedger)
    .where(eq(outcomesLedger.companyKey, String(idOrKey)))
    .orderBy(desc(outcomesLedger.loggedAt));
}

export async function getMeddpicc(idOrKey: string | number) {
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    const r = await db
      .select()
      .from(meddpicc)
      .where(eq(meddpicc.companyId, Number(idOrKey)))
      .limit(1);
    return r[0] ?? null;
  }
  const r = await db
    .select()
    .from(meddpicc)
    .where(eq(meddpicc.companyKey, String(idOrKey)))
    .limit(1);
  return r[0] ?? null;
}

export async function getBuyerCast(idOrKey: string | number) {
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    // Look up company_key via cadence first
    const r = await db
      .select({ companyKey: cadences.companyKey })
      .from(cadences)
      .where(eq(cadences.companyId, Number(idOrKey)))
      .limit(1);
    if (!r[0]?.companyKey) return null;
    const bc = await db
      .select()
      .from(buyerCast)
      .where(eq(buyerCast.companyKey, r[0].companyKey))
      .limit(1);
    return bc[0] ?? null;
  }
  const bc = await db
    .select()
    .from(buyerCast)
    .where(eq(buyerCast.companyKey, String(idOrKey)))
    .limit(1);
  return bc[0] ?? null;
}

/** Primary DM display: prefer master `contacts`, fall back to legacy `buyer_cast`. */
export async function getPrimaryDm(companyId: number) {
  const c = await db
    .select()
    .from(contacts)
    .where(eq(contacts.companyId, companyId))
    .orderBy(desc(contacts.isPrimary))
    .limit(1);
  if (c[0]?.name || c[0]?.email) return c[0];

  // Fallback: legacy buyer_cast (looked up via cadence)
  const cad = await db
    .select({ companyKey: cadences.companyKey })
    .from(cadences)
    .where(eq(cadences.companyId, companyId))
    .limit(1);
  if (!cad[0]?.companyKey) return null;
  const bc = await db
    .select()
    .from(buyerCast)
    .where(eq(buyerCast.companyKey, cad[0].companyKey))
    .limit(1);
  if (!bc[0]) return null;
  return {
    id: -1,
    companyId,
    name: bc[0].owner ?? bc[0].cfo ?? bc[0].officeMom ?? null,
    title: bc[0].owner ? "Owner" : bc[0].cfo ? "CFO" : "Contact",
    email: null,
    phone: null,
    linkedinUrl: null,
    isPrimary: true,
    source: "buyer_cast_fallback",
    createdAt: bc[0].lastSynced,
  };
}

export async function getNotes(idOrKey: string | number) {
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    return db
      .select()
      .from(notes)
      .where(eq(notes.companyId, Number(idOrKey)))
      .orderBy(desc(notes.createdAt));
  }
  // Legacy: companyKey isn't a column on master notes — return [] gracefully
  return [];
}

export async function getTasks(idOrKey: string | number) {
  if (typeof idOrKey === "number" || /^\d+$/.test(String(idOrKey))) {
    return db
      .select()
      .from(tasks)
      .where(eq(tasks.companyId, Number(idOrKey)))
      .orderBy(asc(tasks.dueDate));
  }
  return [];
}

// ----------------------------------------------------------------------------
// "Today" actions feed
// ----------------------------------------------------------------------------

export async function todayActions() {
  const today = format(new Date(), "yyyy-MM-dd");
  const res = await db.execute(sql.raw(`
    SELECT
      t.id AS touch_id, t.day_offset, t.channel, t.scheduled_for, t.completed,
      t.outcome AS touch_outcome, t.notes AS touch_notes, t.broker_captured,
      c.id, c.name, c.county, c.city, c.state, c.zip, c.ee, c.naics, c.vertical,
      c.website, c.linkedin_url, c.multi_state_likely, c.has_health_carriers,
      c.growth_signal, c.pitch_signal, c.pitch_angle, c.disqualified,
      cad.id AS cadence_id, cad.company_key, cad.status AS cadence_status,
      cad.primary_trigger, cad.route_day, cad.score, cad.score_raw,
      cad.score_overlay, cad.weight_mult, cad.tier, cad.fitness_tier,
      cad.evidence, cad.talk_track,
      (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
      (SELECT title FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_title,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_email,
      (SELECT phone FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_phone,
      (SELECT peo_brand FROM incumbent_peo WHERE company_id = c.id ORDER BY observed_at DESC NULLS LAST LIMIT 1) AS incumbent_peo,
      COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
    FROM touches t
    JOIN cadences cad ON cad.id = t.cadence_id
    JOIN companies c ON c.id = cad.company_id
    WHERE t.completed = false
      AND t.scheduled_for <= '${today}'::date
    ORDER BY cad.score DESC NULLS LAST
  `));
  return rowsOf(res).map((r: any) => ({
    touch: {
      id: Number(r.touch_id),
      cadenceId: r.cadence_id == null ? null : Number(r.cadence_id),
      dayOffset: r.day_offset == null ? null : Number(r.day_offset),
      channel: r.channel ?? null,
      scheduledFor: r.scheduled_for ?? null,
      completed: r.completed ?? null,
      outcome: r.touch_outcome ?? null,
      notes: r.touch_notes ?? null,
      brokerCaptured: r.broker_captured ?? null,
      createdAt: null as Date | null,
    },
    account: mapProjection(r),
  }));
}

export async function recentPulse(n = 10) {
  const res = await db.execute(sql.raw(`
    SELECT ol.*, c.id AS c_id, c.name AS c_name, c.county AS c_county,
           cad.company_key AS cad_company_key,
           cad.score AS cad_score, cad.primary_trigger AS cad_primary_trigger
    FROM outcomes_ledger ol
    LEFT JOIN cadences cad ON cad.id = ol.cadence_id OR cad.company_key = ol.company_key
    LEFT JOIN companies c ON c.id = cad.company_id
    ORDER BY ol.logged_at DESC NULLS LAST, ol.id DESC
    LIMIT ${Number(n) || 10}
  `));
  return rowsOf(res).map((r: any) => ({
    ledger: {
      id: Number(r.id),
      touchId: r.touch_id == null ? null : Number(r.touch_id),
      cadenceId: r.cadence_id == null ? null : Number(r.cadence_id),
      companyKey: (r.company_key ?? null) as string | null,
      weekStart: (r.week_start ?? null) as string | null,
      loggedAt: (r.logged_at ?? null) as string | null,
      triggerType: (r.trigger_type ?? null) as string | null,
      vertical: (r.vertical ?? null) as string | null,
      channel: (r.channel ?? null) as string | null,
      dayOffset: r.day_offset == null ? null : Number(r.day_offset),
      routeDay: r.route_day == null ? null : Number(r.route_day),
      scheduledFor: (r.scheduled_for ?? null) as string | null,
      outcome: (r.outcome ?? null) as string | null,
      brokerCaptured: (r.broker_captured ?? null) as string | null,
      notes: (r.notes ?? null) as string | null,
      createdAt: (r.created_at ?? null) as Date | null,
    },
    account: r.c_id
      ? {
          id: Number(r.c_id),
          name: (r.c_name ?? null) as string | null,
          company: (r.c_name ?? null) as string | null,
          companyKey: (r.cad_company_key ?? null) as string | null,
          county: (r.c_county ?? null) as string | null,
          score: r.cad_score,
          primaryTrigger: (r.cad_primary_trigger ?? null) as string | null,
        }
      : null,
  }));
}

// ----------------------------------------------------------------------------
// KPI snapshot — preserved verbatim (the existing /today page + 223 tests rely
// on the exact shape of this return value).
// ----------------------------------------------------------------------------

export async function kpiSnapshot() {
  const res = await db.execute(sql`
    WITH bounds AS (
      SELECT
        date_trunc('week', CURRENT_DATE)::date AS this_week_start,
        (date_trunc('week', CURRENT_DATE) - INTERVAL '7 days')::date AS prev_week_start,
        date_trunc('week', CURRENT_DATE)::date AS prev_week_end,
        (CURRENT_DATE - INTERVAL '14 days')::date AS trend_start,
        (CURRENT_DATE - INTERVAL '30 days')::date AS month_start
    ),
    touches_this_week AS (
      SELECT COUNT(*)::int AS n
      FROM ${outcomesLedger}, bounds
      WHERE logged_at >= bounds.this_week_start
    ),
    touches_prev_week AS (
      SELECT COUNT(*)::int AS n
      FROM ${outcomesLedger}, bounds
      WHERE logged_at >= bounds.prev_week_start
        AND logged_at <  bounds.prev_week_end
    ),
    active_accounts AS (
      SELECT COUNT(*)::int AS n
      FROM ${cadences} WHERE status IN ('active','ACTIVE','warm_followup')
    ),
    meetings_booked AS (
      SELECT COUNT(*)::int AS n
      FROM ${outcomesLedger}, bounds
      WHERE outcome IN (
              'BOOKED','MEETING_BOOKED','DISCOVERY_HELD','meeting_booked','meeting_held'
            )
        AND logged_at >= bounds.this_week_start
    ),
    conversion AS (
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE outcome IN (
          'BOOKED','MEETING_BOOKED','INTERESTED','DISCOVERY_HELD',
          'meeting_booked','meeting_held','interested'
        ))::int AS positive
      FROM ${outcomesLedger}, bounds
      WHERE logged_at >= bounds.month_start
    ),
    trend AS (
      SELECT to_char(d.day, 'YYYY-MM-DD') AS d,
             COALESCE(COUNT(ol.id),0)::int AS n
      FROM bounds,
           generate_series(bounds.trend_start, CURRENT_DATE, INTERVAL '1 day') AS d(day)
      LEFT JOIN ${outcomesLedger} ol
        ON ol.logged_at = d.day::date
      GROUP BY 1
      ORDER BY 1
    )
    SELECT
      (SELECT n FROM touches_this_week)             AS touches_this_week,
      (SELECT n FROM touches_prev_week)             AS touches_prev_week,
      (SELECT n FROM active_accounts)               AS active_accounts,
      (SELECT n FROM meetings_booked)               AS meetings_booked,
      (SELECT total FROM conversion)                AS conv_total,
      (SELECT positive FROM conversion)             AS conv_positive,
      (SELECT json_agg(json_build_object('date', d, 'n', n) ORDER BY d) FROM trend) AS trend14d
  `);

  const row = rowsOf(res)[0] ?? {};
  const total = Number(row.conv_total ?? 0);
  const positive = Number(row.conv_positive ?? 0);
  const trendRaw = (row.trend14d ?? []) as Array<{ date: string; n: number }>;

  return {
    touchesThisWeek: Number(row.touches_this_week ?? 0),
    touchesPrevWeek: Number(row.touches_prev_week ?? 0),
    touchesTarget: 45,
    activeAccounts: Number(row.active_accounts ?? 0),
    activeTarget: 50,
    meetingsBooked: Number(row.meetings_booked ?? 0),
    meetingsTarget: 3,
    conversionPct: total > 0 ? (positive / total) * 100 : 0,
    trend14d: trendRaw.map((r) => ({ date: r.date, touches: Number(r.n) })),
  };
}

export async function touchTrend(days = 28) {
  const since = format(subDays(new Date(), days), "yyyy-MM-dd");
  const res = await db.execute(
    sql`SELECT to_char(logged_at,'YYYY-MM-DD') as d, COUNT(*)::int as count
        FROM ${outcomesLedger}
        WHERE logged_at >= ${since}::date
        GROUP BY 1
        ORDER BY 1`,
  );
  return rowsOf(res).map((r: any) => ({
    date: r.d,
    touches: Number(r.count),
  }));
}

export async function conversionByTrigger() {
  const res = await db.execute(
    sql`SELECT COALESCE(trigger_type,'unknown') as trigger,
               (COUNT(*) FILTER (WHERE outcome IN ('BOOKED','MEETING_BOOKED','DISCOVERY_HELD','INTERESTED')))::numeric
                 / NULLIF(COUNT(*),0)::numeric * 100 as conv,
               COUNT(*)::int as n
        FROM ${outcomesLedger}
        GROUP BY 1
        ORDER BY conv DESC NULLS LAST
        LIMIT 10`,
  );
  return rowsOf(res).map((r: any) => ({
    trigger: r.trigger,
    conv: Number(r.conv ?? 0),
    n: Number(r.n ?? 0),
  }));
}

export async function portfolioMix() {
  const res = await db.execute(
    sql`SELECT COALESCE(primary_trigger,'unknown') as trigger, COUNT(*)::int as n
        FROM ${cadences}
        WHERE status IN ('active','ACTIVE')
        GROUP BY 1
        ORDER BY n DESC`,
  );
  return rowsOf(res).map((r: any) => ({
    name: r.trigger,
    value: Number(r.n),
  }));
}

export async function pipelineByStage() {
  const stages = [
    "Discovery scheduled",
    "Discovery held",
    "Proposal sent",
    "Closed-Won",
    "Closed-Lost",
    "Nurture",
  ];
  const rows = await db
    .select({
      stage: meddpicc.stage,
      companyId: meddpicc.companyId,
      companyKey: meddpicc.companyKey,
      firstMeetingDate: meddpicc.firstMeetingDate,
      mMetrics: meddpicc.mMetrics,
      eEconBuyer: meddpicc.eEconBuyer,
      iPain: meddpicc.iPain,
      cChampion: meddpicc.cChampion,
      nextAction: meddpicc.nextAction,
    })
    .from(meddpicc);

  // batch-fetch company names for stage cards
  const ids = Array.from(
    new Set(rows.map((r) => r.companyId).filter((x): x is number => x != null)),
  );
  const companyById = new Map<number, string>();
  if (ids.length > 0) {
    const cs = await db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(inArray(companies.id, ids));
    for (const c of cs) companyById.set(c.id, c.name ?? "");
  }

  const grouped: Record<string, any[]> = {};
  for (const s of stages) grouped[s] = [];
  for (const r of rows) {
    const s = r.stage || "Nurture";
    const key =
      s === "discovery_scheduled"
        ? "Discovery scheduled"
        : s === "discovery_held"
          ? "Discovery held"
          : s === "proposal_sent"
            ? "Proposal sent"
            : s === "closed_won"
              ? "Closed-Won"
              : s === "closed_lost"
                ? "Closed-Lost"
                : s === "nurture"
                  ? "Nurture"
                  : s;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      ...r,
      company:
        r.companyId != null ? companyById.get(r.companyId) ?? null : null,
    });
  }
  return { stages, grouped };
}

export async function listBrokers() {
  return db.select().from(channelBrokers).orderBy(asc(channelBrokers.name));
}

export async function listWeights() {
  return db.select().from(weightsCurrent).orderBy(desc(weightsCurrent.multiplier));
}

export async function countiesFacet() {
  const res = await db.execute(
    sql`SELECT COALESCE(county,'unknown') as county, COUNT(*)::int as n
        FROM ${companies} WHERE disqualified = false AND state = 'NC'
        GROUP BY 1 ORDER BY n DESC`,
  );
  return rowsOf(res).map((r: any) => ({
    county: r.county,
    n: Number(r.n),
  }));
}

export async function verticalsFacet() {
  const res = await db.execute(
    sql`SELECT COALESCE(vertical,'unknown') as vertical, COUNT(*)::int as n
        FROM ${companies} WHERE disqualified = false AND state = 'NC'
        GROUP BY 1 ORDER BY n DESC`,
  );
  return rowsOf(res).map((r: any) => ({
    vertical: r.vertical,
    n: Number(r.n),
  }));
}

export async function triggersFacet() {
  const res = await db.execute(
    sql`SELECT trigger_type, COUNT(*)::int as n
        FROM ${triggersTable}
        GROUP BY 1
        ORDER BY n DESC`,
  );
  return rowsOf(res).map((r: any) => ({
    trigger: r.trigger_type ?? "unknown",
    n: Number(r.n),
  }));
}

// ----------------------------------------------------------------------------
// v1.1: new helpers
// ----------------------------------------------------------------------------

export type BenchFilters = AccountFilters;

/**
 * Bench page — qualified ICP-fit prospects (disqualified=false, NC, 11–55 EE)
 * that are NOT in an active cadence yet. Filters mirror searchAccounts().
 * Ordered by computed score (sum of trigger scores) DESC.
 */
export async function getBenchPage(
  filters: BenchFilters = {},
  page = 1,
): Promise<PageResult<AccountProjection>> {
  const offset = Math.max(0, (page - 1) * PAGE_SIZE);

  const extra: string[] = [
    "c.ee BETWEEN 11 AND 55",
    "(cad.id IS NULL OR cad.status NOT IN ('active','warm_followup'))",
  ];

  const where = buildAccountsWhere(filters);
  const fullWhere = [where, ...extra].join(" AND ");

  const baseQuery = sql.raw(`
    SELECT
      c.id, c.name, c.name_normalized, c.city, c.county, c.state, c.zip,
      c.ein, c.domain, c.website, c.linkedin_url, c.naics, c.vertical,
      c.ee, c.multi_state_likely, c.fed_contractor, c.has_5500,
      c.has_health_carriers, c.growth_signal, c.pitch_signal, c.pitch_angle,
      c.disqualified, c.disqualified_reason, c.source,
      cad.company_key, cad.status AS cadence_status, cad.primary_trigger,
      cad.route_day, cad.score, cad.score_raw, cad.score_overlay,
      cad.weight_mult, cad.start_date, cad.tier, cad.fitness_tier,
      cad.enrichment_notes, cad.evidence, cad.talk_track,
      cad.vertical AS cadence_vertical,
      (SELECT name FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
      (SELECT title FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_title,
      (SELECT email FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_email,
      (SELECT phone FROM contacts WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_phone,
      (SELECT peo_brand FROM incumbent_peo WHERE company_id = c.id ORDER BY observed_at DESC NULLS LAST LIMIT 1) AS incumbent_peo,
      COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
    FROM companies c
    LEFT JOIN cadences cad ON cad.company_id = c.id
    WHERE ${fullWhere}
    ORDER BY computed_score DESC NULLS LAST, c.id ASC
    LIMIT ${PAGE_SIZE} OFFSET ${offset}
  `);
  const countQuery = sql.raw(`
    SELECT COUNT(*)::int AS n FROM (
      SELECT c.id,
             COALESCE((SELECT SUM(score)::float FROM triggers WHERE company_id = c.id), 0) AS computed_score
      FROM companies c
      LEFT JOIN cadences cad ON cad.company_id = c.id
      WHERE ${fullWhere}
    ) sub
  `);

  const [rowsRes, countRes] = await Promise.all([
    db.execute(baseQuery),
    db.execute(countQuery),
  ]);
  const rows = rowsOf(rowsRes).map(mapProjection);
  const totalCount = Number(rowsOf(countRes)[0]?.n ?? 0);
  return {
    rows,
    totalCount,
    hasNextPage: offset + rows.length < totalCount,
    page,
    pageSize: PAGE_SIZE,
  };
}

/**
 * Typeahead search for Cmd+K palette. Normalizes the query to lowercase +
 * alphanumeric only so "air pur" matches "AIR PURIFICATION, INC.".
 */
export async function searchCompaniesTypeahead(q: string, limit = 20) {
  const normalized = q.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!normalized) return [];
  const limitInt = Math.min(50, Math.max(1, Math.floor(limit)));
  const res = await db.execute(sql`
    SELECT
      c.id, c.name, c.county, c.ee,
      COALESCE((SELECT SUM(score)::float FROM ${triggersTable} WHERE company_id = c.id), 0) AS score
    FROM ${companies} c
    WHERE c.disqualified = false
      AND c.state = 'NC'
      AND c.name_normalized LIKE ${"%" + normalized + "%"}
    ORDER BY score DESC NULLS LAST, c.id ASC
    LIMIT ${limitInt}
  `);
  return rowsOf(res).map((r: any) => ({
    id: Number(r.id),
    name: r.name as string,
    county: r.county as string | null,
    ee: r.ee == null ? null : Number(r.ee),
    score: r.score == null ? 0 : Number(r.score),
  }));
}

/**
 * Top-N companies for the Cmd+K palette mount payload. Returns the highest-
 * scoring qualified prospects so the user can fuzzy-search the loaded slice
 * without a network round trip.
 */
export async function topCompaniesForCommandPalette(limit = 200) {
  const limitInt = Math.min(500, Math.max(1, Math.floor(limit)));
  const res = await db.execute(sql`
    SELECT
      c.id, c.name, c.county,
      cad.primary_trigger,
      (SELECT name FROM ${contacts} WHERE company_id = c.id AND is_primary = true LIMIT 1) AS dm_name,
      COALESCE((SELECT SUM(score)::float FROM ${triggersTable} WHERE company_id = c.id), 0) AS score
    FROM ${companies} c
    LEFT JOIN ${cadences} cad ON cad.company_id = c.id
    WHERE c.disqualified = false AND c.state = 'NC'
    ORDER BY score DESC NULLS LAST, c.id ASC
    LIMIT ${limitInt}
  `);
  return rowsOf(res).map((r: any) => ({
    id: Number(r.id),
    name: r.name as string,
    county: (r.county as string | null) ?? null,
    primaryTrigger: (r.primary_trigger as string | null) ?? null,
    dmName: (r.dm_name as string | null) ?? null,
    score: r.score == null ? 0 : Number(r.score),
  }));
}

/** Per-vertical count of currently-active trigger fires. */
export async function getTriggerFiresThisWeek() {
  const res = await db.execute(sql`
    SELECT
      COALESCE(c.vertical, 'Unknown') AS vertical,
      COUNT(*)::int AS fires
    FROM ${triggersTable} t
    JOIN ${companies} c ON c.id = t.company_id
    WHERE c.disqualified = false AND c.state = 'NC'
    GROUP BY 1
    ORDER BY fires DESC NULLS LAST
  `);
  return rowsOf(res).map((r: any) => ({
    vertical: r.vertical as string,
    fires: Number(r.fires),
  }));
}

/**
 * Industry trends panel for /dashboard. Aggregates per vertical:
 *  - companies (qualified count)
 *  - mean trigger score
 *  - top WC carrier name (most common carrier across companies in this vertical)
 *  - top health carrier name
 */
export async function getIndustryTrends() {
  const res = await db.execute(sql`
    WITH per_company AS (
      SELECT
        c.id,
        COALESCE(c.vertical, 'Unknown') AS vertical,
        COALESCE((
          SELECT SUM(score)::float FROM ${triggersTable} WHERE company_id = c.id
        ), 0) AS score
      FROM ${companies} c
      WHERE c.disqualified = false AND c.state = 'NC'
    ),
    base AS (
      SELECT vertical,
             COUNT(*)::int AS companies,
             AVG(score)::float AS mean_score,
             SUM(score)::float AS total_score
      FROM per_company
      GROUP BY 1
    ),
    top_carrier AS (
      SELECT vertical, carrier_name, n,
             ROW_NUMBER() OVER (PARTITION BY vertical ORDER BY n DESC) AS rn
      FROM (
        SELECT COALESCE(c.vertical, 'Unknown') AS vertical,
               car.carrier_name,
               COUNT(*)::int AS n
        FROM ${carriers} car
        JOIN ${companies} c ON c.id = car.company_id
        WHERE c.disqualified = false AND c.state = 'NC' AND car.carrier_name IS NOT NULL
        GROUP BY 1, 2
      ) x
    )
    SELECT b.vertical, b.companies, b.mean_score, b.total_score,
           (SELECT carrier_name FROM top_carrier WHERE vertical = b.vertical AND rn = 1) AS top_carrier
    FROM base b
    ORDER BY b.companies DESC
  `);
  return rowsOf(res).map((r: any) => ({
    vertical: r.vertical as string,
    companies: Number(r.companies ?? 0),
    meanScore: Number(r.mean_score ?? 0),
    totalScore: Number(r.total_score ?? 0),
    topCarrier: (r.top_carrier as string | null) ?? null,
  }));
}

// ----------------------------------------------------------------------------
// Legacy listAccounts shim (still used by /accounts initial scaffold)
// ----------------------------------------------------------------------------

export async function listAccounts(opts: AccountFilters & {
  limit?: number;
  offset?: number;
} = {}) {
  const { limit = 500, offset = 0, ...filters } = opts;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const result = await searchAccounts(filters, page);
  return result.rows.slice(0, limit);
}
