import {
  pgTable,
  text,
  integer,
  numeric,
  boolean,
  date,
  timestamp,
  bigserial,
  serial,
  char,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

/**
 * v1.1 master schema: introspected from the live Neon DB.
 *
 * Two generations coexist:
 *  - Master tables (new): companies, contacts, triggers, carriers,
 *    incumbent_peo. Root entity is `companies.id`.
 *  - Legacy/CRM tables retained for v1 read paths: cadences, touches,
 *    outcomes_ledger, meddpicc, buyer_cast, channel_brokers, weights_current,
 *    notes, tasks, weekly_metrics.
 *
 * Where the migration spec (`02-database-design.md`) and the actual ETL
 * schema diverged, this file mirrors the *actual* DB. Notable differences:
 *  - `companies` has no `status` column — disqualification is just
 *    `disqualified: boolean`. Bench/active distinction is computed from
 *    `cadences.status`.
 *  - `triggers.weight` is named `score` in the DB; `evidence_date` is
 *    named `trigger_date`; there is no `still_active` column (we treat
 *    any trigger as currently active for v1.1).
 *  - `incumbent_peo` only has `peo_brand` + `confidence` + `evidence` +
 *    `filing_year` + `observed_at`. No separate `peo_canonical` or
 *    `is_stale` — we derive both at query time.
 *  - `notes` / `tasks` live as the master tables (not crm_notes / crm_tasks).
 *  - `weights_current.multiplier` is named `mult`.
 *  - `outcomes_ledger.trigger_type` (not `trigger`).
 */

// ---------- Master tables (new) ----------

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    city: text("city"),
    county: text("county"),
    state: char("state", { length: 2 }).default("NC"),
    zip: text("zip"),
    ein: text("ein"),
    domain: text("domain"),
    website: text("website"),
    linkedinUrl: text("linkedin_url"),
    naics: text("naics"),
    vertical: text("vertical"),
    ee: integer("ee"),
    multiStateLikely: boolean("multi_state_likely").default(false),
    fedContractor: boolean("fed_contractor").default(false),
    has5500: boolean("has_5500").default(false),
    hasHealthCarriers: boolean("has_health_carriers").default(false),
    growthSignal: text("growth_signal"),
    pitchSignal: text("pitch_signal"),
    pitchAngle: text("pitch_angle"),
    disqualified: boolean("disqualified").default(false),
    disqualifiedReason: text("disqualified_reason"),
    source: text("source"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).defaultNow(),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    nameZipUniq: uniqueIndex("companies_name_normalized_zip_key").on(
      t.nameNormalized,
      t.zip,
    ),
    byNameNorm: index("idx_companies_name_norm").on(t.nameNormalized),
    byState: index("idx_companies_state").on(t.state),
    byVertical: index("idx_companies_vertical").on(t.vertical),
    byZip: index("idx_companies_zip").on(t.zip),
    byDisqual: index("idx_companies_disqual").on(t.disqualified),
  }),
);

export const contacts = pgTable(
  "contacts",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    name: text("name"),
    title: text("title"),
    email: text("email"),
    phone: text("phone"),
    linkedinUrl: text("linkedin_url"),
    isPrimary: boolean("is_primary").default(false),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompany: index("idx_contacts_company").on(t.companyId),
    byEmail: index("idx_contacts_email").on(t.email),
  }),
);

export const carriers = pgTable(
  "carriers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    carrierName: text("carrier_name"),
    benefitType: text("benefit_type"),
    naic: text("naic"),
    premium: numeric("premium"),
    coveredLives: integer("covered_lives"),
    planYear: integer("plan_year"),
    source: text("source"),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompany: index("idx_carriers_company").on(t.companyId),
    byName: index("idx_carriers_name").on(t.carrierName),
  }),
);

export const triggers = pgTable(
  "triggers",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    triggerType: text("trigger_type"),
    score: numeric("score"),
    evidence: text("evidence"),
    triggerDate: date("trigger_date"),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompany: index("idx_triggers_company").on(t.companyId),
    byType: index("idx_triggers_type").on(t.triggerType),
  }),
);

export const incumbentPeo = pgTable(
  "incumbent_peo",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id").references(() => companies.id, {
      onDelete: "cascade",
    }),
    peoBrand: text("peo_brand"),
    confidence: text("confidence"),
    evidence: text("evidence"),
    filingYear: integer("filing_year"),
    source: text("source"),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompany: index("idx_incumbent_company").on(t.companyId),
    byBrand: index("idx_incumbent_brand").on(t.peoBrand),
  }),
);

// ---------- Legacy / CRM-side tables (introspection-aligned) ----------

export const cadences = pgTable(
  "cadences",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    // company_key kept for back-compat with v1 sync_to_neon.py; some
    // CRM Server Actions still resolve a cadence by this string.
    companyKey: text("company_key").unique(),
    status: text("status").notNull().default("active"),
    startDate: date("start_date"),
    routeDay: integer("route_day"),
    score: numeric("score"),
    scoreRaw: numeric("score_raw"),
    scoreOverlay: numeric("score_overlay"),
    weightMult: numeric("weight_mult"),
    primaryTrigger: text("primary_trigger"),
    tier: text("tier"),
    fitnessTier: text("fitness_tier"),
    enrichmentNotes: text("enrichment_notes"),
    evidence: text("evidence"),
    talkTrack: text("talk_track"),
    vertical: text("vertical"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompanyId: index("idx_cadences_company").on(t.companyId),
    byStatus: index("idx_cadences_status").on(t.status),
  }),
);

export const touches = pgTable(
  "touches",
  {
    id: serial("id").primaryKey(),
    cadenceId: integer("cadence_id"),
    dayOffset: integer("day_offset"),
    channel: text("channel"),
    scheduledFor: date("scheduled_for"),
    completed: boolean("completed").default(false),
    outcome: text("outcome"),
    notes: text("notes"),
    brokerCaptured: text("broker_captured"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCadence: index("touches_cadence_idx").on(t.cadenceId),
    bySchedule: index("touches_sched_idx").on(t.scheduledFor),
  }),
);

export const outcomesLedger = pgTable(
  "outcomes_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    touchId: integer("touch_id"),
    cadenceId: integer("cadence_id"),
    // company_key retained for back-compat — Python writer still emits it
    companyKey: text("company_key"),
    weekStart: date("week_start"),
    loggedAt: date("logged_at"),
    triggerType: text("trigger_type"),
    vertical: text("vertical"),
    channel: text("channel"),
    dayOffset: integer("day_offset"),
    routeDay: integer("route_day"),
    scheduledFor: date("scheduled_for"),
    outcome: text("outcome"),
    brokerCaptured: text("broker_captured"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompany: index("ol_company_idx").on(t.companyKey),
    byLogged: index("ol_logged_idx").on(t.loggedAt),
  }),
);

export const buyerCast = pgTable("buyer_cast", {
  companyKey: text("company_key").primaryKey(),
  owner: text("owner"),
  cfo: text("cfo"),
  officeMom: text("office_mom"),
  broker: text("broker"),
  cpa: text("cpa"),
  attorney: text("attorney"),
  lastSynced: timestamp("last_synced", { withTimezone: true }).defaultNow(),
});

export const meddpicc = pgTable(
  "meddpicc",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    // company_key kept for back-compat with v1 actions.
    companyKey: text("company_key").unique(),
    firstMeetingDate: date("first_meeting_date"),
    stage: text("stage"),
    mMetrics: text("m_metrics"),
    eEconBuyer: text("e_econ_buyer"),
    d1DecisionCriteria: text("d1_decision_criteria"),
    d2DecisionProcess: text("d2_decision_process"),
    pPaperProcess: text("p_paper_process"),
    iPain: text("i_pain"),
    cChampion: text("c_champion"),
    cmpCompetition: text("cmp_competition"),
    nextAction: text("next_action"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    byCompanyId: index("meddpicc_company_idx").on(t.companyId),
  }),
);

export const channelBrokers = pgTable("channel_brokers", {
  name: text("name").primaryKey(),
  firstSeen: date("first_seen"),
  firstSeenVia: text("first_seen_via"),
  county: text("county"),
  phone: text("phone"),
  email: text("email"),
  lastBriefSent: date("last_brief_sent"),
  lunchStatus: text("lunch_status"),
  nClientsObserved: integer("n_clients_observed"),
  notes: text("notes"),
});

export const weightsCurrent = pgTable("weights_current", {
  id: serial("id").primaryKey(),
  dim: text("dim"),
  key: text("key"),
  multiplier: numeric("mult"),
  lastRecomputed: date("last_recomputed"),
  nOutcomesAtRecompute: integer("n_outcomes"),
});

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    body: text("body").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ byCompany: index("notes_company_idx").on(t.companyId) }),
);

export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    companyId: integer("company_id"),
    title: text("title"),
    body: text("body"),
    dueDate: date("due_date"),
    status: text("status"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (t) => ({ byCompany: index("tasks_company_idx").on(t.companyId) }),
);

export const weeklyMetrics = pgTable("weekly_metrics", {
  id: serial("id").primaryKey(),
  weekStart: date("week_start"),
  touches: integer("touches").default(0),
  progressions: integer("progressions").default(0),
  meetingsBooked: integer("meetings_booked").default(0),
  meetingsHeld: integer("meetings_held").default(0),
  killed: integer("killed").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ---------- Relations ----------

export const companiesRelations = relations(companies, ({ many, one }) => ({
  contacts: many(contacts),
  carriers: many(carriers),
  triggers: many(triggers),
  incumbents: many(incumbentPeo),
  cadence: one(cadences, {
    fields: [companies.id],
    references: [cadences.companyId],
  }),
  meddpicc: one(meddpicc, {
    fields: [companies.id],
    references: [meddpicc.companyId],
  }),
  notes: many(notes),
  tasks: many(tasks),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  company: one(companies, {
    fields: [contacts.companyId],
    references: [companies.id],
  }),
}));

export const carriersRelations = relations(carriers, ({ one }) => ({
  company: one(companies, {
    fields: [carriers.companyId],
    references: [companies.id],
  }),
}));

export const triggersRelations = relations(triggers, ({ one }) => ({
  company: one(companies, {
    fields: [triggers.companyId],
    references: [companies.id],
  }),
}));

export const incumbentPeoRelations = relations(incumbentPeo, ({ one }) => ({
  company: one(companies, {
    fields: [incumbentPeo.companyId],
    references: [companies.id],
  }),
}));

export const cadencesRelations = relations(cadences, ({ many, one }) => ({
  company: one(companies, {
    fields: [cadences.companyId],
    references: [companies.id],
  }),
  touches: many(touches),
  buyerCast: one(buyerCast, {
    fields: [cadences.companyKey],
    references: [buyerCast.companyKey],
  }),
  meddpicc: one(meddpicc, {
    fields: [cadences.companyKey],
    references: [meddpicc.companyKey],
  }),
}));

export const touchesRelations = relations(touches, ({ one }) => ({
  cadence: one(cadences, {
    fields: [touches.cadenceId],
    references: [cadences.id],
  }),
}));

export const meddpiccRelations = relations(meddpicc, ({ one }) => ({
  company: one(companies, {
    fields: [meddpicc.companyId],
    references: [companies.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  company: one(companies, {
    fields: [notes.companyId],
    references: [companies.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one }) => ({
  company: one(companies, {
    fields: [tasks.companyId],
    references: [companies.id],
  }),
}));

// ---------- Type exports ----------

export type Company = typeof companies.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type Carrier = typeof carriers.$inferSelect;
export type Trigger = typeof triggers.$inferSelect;
export type IncumbentPeo = typeof incumbentPeo.$inferSelect;
export type Cadence = typeof cadences.$inferSelect;
export type Touch = typeof touches.$inferSelect;
export type OutcomeRow = typeof outcomesLedger.$inferSelect;
export type BuyerCast = typeof buyerCast.$inferSelect;
export type Meddpicc = typeof meddpicc.$inferSelect;
export type Broker = typeof channelBrokers.$inferSelect;
export type Weight = typeof weightsCurrent.$inferSelect;
export type Note = typeof notes.$inferSelect;
export type Task = typeof tasks.$inferSelect;

/**
 * Composite shape used by the v1 UI: a company + its (optional) active
 * cadence + a primary contact. Many existing components were typed against
 * `Account` (the old all-in-one cadence shape) — we keep the alias and
 * widen it so the new join-based rows remain assignable.
 *
 * Every field is optional so callers can pass either the master-table
 * projection or the legacy cadence row without TS errors.
 */
export type AccountSummary = {
  // Master / cadence identifiers
  id?: number | null;
  companyId?: number | null;
  companyKey?: string | null;

  // Master company columns
  name?: string | null;
  nameNormalized?: string | null;
  city?: string | null;
  county?: string | null;
  state?: string | null;
  zip?: string | null;
  ein?: string | null;
  domain?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
  naics?: string | null;
  vertical?: string | null;
  ee?: number | null;
  multiStateLikely?: boolean | null;
  fedContractor?: boolean | null;
  has5500?: boolean | null;
  hasHealthCarriers?: boolean | null;
  growthSignal?: string | null;
  pitchSignal?: string | null;
  pitchAngle?: string | null;
  disqualified?: boolean | null;
  disqualifiedReason?: string | null;
  source?: string | null;
  firstSeen?: string | Date | null;
  lastUpdated?: string | Date | null;

  // Cadence overlay (when one exists)
  status?: string | null;
  primaryTrigger?: string | null;
  routeDay?: number | null;
  score?: string | number | null;
  scoreRaw?: string | number | null;
  scoreOverlay?: string | number | null;
  weightMult?: string | number | null;
  startDate?: string | Date | null;
  tier?: string | null;
  fitnessTier?: string | null;
  enrichmentNotes?: string | null;
  evidence?: string | null;
  talkTrack?: string | null;

  // Display aliases (back-compat with v1 'cadences.company' / dm_*)
  company?: string | null;
  dmName?: string | null;
  dmTitle?: string | null;
  dmEmail?: string | null;
  phone?: string | null;

  // Derived / overlay (computed from joins)
  computedScore?: number | null;
  incumbentPeo?: string | null;
  incumbentStale?: boolean | null;
  wcCarrier?: string | null;
  wcRenewal?: string | null;
  hasHealthBenefits?: boolean | null;
  growthTier?: string | null;
  daysOut?: number | null;
  multiCarrierConsolidation?: number | null;
  disqualifyRecommendation?: boolean | null;
};

// Back-compat alias — many existing components import { Account }.
export type Account = AccountSummary;
