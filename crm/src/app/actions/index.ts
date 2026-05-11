"use server";

import { db } from "@/db/client";
import {
  touches,
  outcomesLedger,
  cadences,
  companies,
  contacts,
  meddpicc,
  notes,
  tasks,
} from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { format, addDays } from "date-fns";
import { z } from "zod";
import { getWeekStart } from "@/lib/utils";
import {
  login as authLogin,
  logout as authLogout,
  requireAuth,
  rateLimitLogin,
  clearRateLimit,
  loginIp,
} from "@/lib/auth";
import {
  routeDayForCounty,
  buildTouchSchedule,
  KILL_OUTCOMES,
  NURTURE_OUTCOMES,
} from "@/lib/cadence";
import { redirect } from "next/navigation";

// ---------- Auth ----------
const LoginSchema = z.object({
  password: z.string().min(1, "Password required"),
});

export async function loginAction(_prev: unknown, formData: FormData) {
  const ip = await loginIp();
  const limit = rateLimitLogin(ip);
  if (!limit.ok) {
    return {
      ok: false as const,
      error: "Too many attempts. Try again in 5 minutes.",
    };
  }

  const parsed = LoginSchema.safeParse({
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { ok: false as const, error: "Password required" };
  }
  const ok = await authLogin(parsed.data.password);
  if (!ok) return { ok: false as const, error: "Incorrect password" };
  clearRateLimit(ip);
  redirect("/today");
}

export async function logoutAction() {
  await requireAuth();
  await authLogout();
  redirect("/login");
}

// ---------- Helper: resolve cadence/company from a key OR id ----------
async function resolveCadence(idOrKey: string | number): Promise<{
  cadenceId: number | null;
  companyId: number | null;
  companyKey: string | null;
  companyName: string | null;
  county: string | null;
  primaryTrigger: string | null;
  vertical: string | null;
  routeDay: number | null;
}> {
  const isNumeric = /^\d+$/.test(String(idOrKey));
  let companyId: number | null = isNumeric ? Number(idOrKey) : null;
  let companyKey: string | null = isNumeric ? null : String(idOrKey);

  // If the caller passed a numeric id, look up cadence by company_id.
  if (companyId != null) {
    const r = await db
      .select({
        id: cadences.id,
        companyKey: cadences.companyKey,
        routeDay: cadences.routeDay,
        primaryTrigger: cadences.primaryTrigger,
        vertical: cadences.vertical,
      })
      .from(cadences)
      .where(eq(cadences.companyId, companyId))
      .limit(1);
    const co = await db
      .select({
        id: companies.id,
        name: companies.name,
        county: companies.county,
      })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    return {
      cadenceId: r[0]?.id ?? null,
      companyId,
      companyKey: r[0]?.companyKey ?? null,
      companyName: co[0]?.name ?? null,
      county: co[0]?.county ?? null,
      primaryTrigger: r[0]?.primaryTrigger ?? null,
      vertical: r[0]?.vertical ?? null,
      routeDay: r[0]?.routeDay ?? null,
    };
  }
  // Caller passed a legacy company_key
  const r = await db
    .select({
      id: cadences.id,
      companyId: cadences.companyId,
      companyKey: cadences.companyKey,
      routeDay: cadences.routeDay,
      primaryTrigger: cadences.primaryTrigger,
      vertical: cadences.vertical,
    })
    .from(cadences)
    .where(eq(cadences.companyKey, companyKey!))
    .limit(1);
  const cid = r[0]?.companyId ?? null;
  let name: string | null = null;
  let county: string | null = null;
  if (cid != null) {
    const co = await db
      .select({ name: companies.name, county: companies.county })
      .from(companies)
      .where(eq(companies.id, cid))
      .limit(1);
    name = co[0]?.name ?? null;
    county = co[0]?.county ?? null;
  }
  return {
    cadenceId: r[0]?.id ?? null,
    companyId: cid,
    companyKey,
    companyName: name,
    county,
    primaryTrigger: r[0]?.primaryTrigger ?? null,
    vertical: r[0]?.vertical ?? null,
    routeDay: r[0]?.routeDay ?? null,
  };
}

// ---------- Outcomes / Touches ----------
const LogOutcomeSchema = z.object({
  touchId: z.number().int().optional(),
  companyKey: z.string().min(1), // accepts numeric id or legacy text key
  channel: z.string().min(1),
  outcome: z.string().min(1),
  notes: z.string().optional().nullable(),
  brokerCaptured: z.string().optional().nullable(),
});

export async function logOutcome(input: z.infer<typeof LogOutcomeSchema>) {
  await requireAuth();
  const data = LogOutcomeSchema.parse(input);
  const today = format(new Date(), "yyyy-MM-dd");
  const outcomeKey = data.outcome.toLowerCase();

  const cad = await resolveCadence(data.companyKey);

  // Mark the touch complete (if id provided)
  let touchScheduledFor: string | null = null;
  if (data.touchId) {
    const t = await db
      .select({ scheduledFor: touches.scheduledFor })
      .from(touches)
      .where(eq(touches.id, data.touchId))
      .limit(1);
    touchScheduledFor = t[0]?.scheduledFor ?? null;

    await db
      .update(touches)
      .set({
        completed: true,
        outcome: data.outcome,
        notes: data.notes ?? null,
        brokerCaptured: data.brokerCaptured ?? null,
      })
      .where(eq(touches.id, data.touchId));
  }

  // Append-only ledger entry
  await db.insert(outcomesLedger).values({
    touchId: data.touchId ?? null,
    cadenceId: cad.cadenceId ?? null,
    companyKey: cad.companyKey,
    weekStart: getWeekStart(),
    loggedAt: today,
    triggerType: cad.primaryTrigger,
    vertical: cad.vertical,
    channel: data.channel,
    routeDay: cad.routeDay,
    scheduledFor: today,
    outcome: data.outcome,
    brokerCaptured: data.brokerCaptured ?? null,
    notes: data.notes ?? null,
  });

  // ---- Cadence status transitions ----
  if (cad.cadenceId) {
    if (KILL_OUTCOMES.has(outcomeKey)) {
      await db
        .update(cadences)
        .set({
          status: "DISQUALIFIED",
          enrichmentNotes: `killed_${outcomeKey}`,
        })
        .where(eq(cadences.id, cad.cadenceId));
    } else if (NURTURE_OUTCOMES.has(outcomeKey)) {
      const until = format(addDays(new Date(), 90), "yyyy-MM-dd");
      await db
        .update(cadences)
        .set({
          status: "NURTURE",
          enrichmentNotes: `nurture_until=${until}`,
        })
        .where(eq(cadences.id, cad.cadenceId));
    }
  }

  // ---- MEDDPICC auto-create / advance ----
  if (outcomeKey === "meeting_booked" && cad.companyId != null) {
    const existing = await db
      .select({ id: meddpicc.id })
      .from(meddpicc)
      .where(eq(meddpicc.companyId, cad.companyId))
      .limit(1);
    if (!existing.length) {
      await db.insert(meddpicc).values({
        companyId: cad.companyId,
        companyKey: cad.companyKey,
        stage: "discovery_scheduled",
        firstMeetingDate: touchScheduledFor ?? today,
      });
    }
  } else if (outcomeKey === "meeting_held" && cad.companyId != null) {
    const existing = await db
      .select({ stage: meddpicc.stage })
      .from(meddpicc)
      .where(eq(meddpicc.companyId, cad.companyId))
      .limit(1);
    if (!existing.length) {
      await db.insert(meddpicc).values({
        companyId: cad.companyId,
        companyKey: cad.companyKey,
        stage: "discovery_held",
        firstMeetingDate: touchScheduledFor ?? today,
      });
    } else if (existing[0]?.stage === "discovery_scheduled") {
      await db
        .update(meddpicc)
        .set({
          stage: "discovery_held",
          firstMeetingDate: touchScheduledFor ?? today,
        })
        .where(eq(meddpicc.companyId, cad.companyId));
    }
  }

  revalidatePath("/today");
  revalidatePath("/accounts");
  if (cad.companyId != null) {
    revalidatePath(`/accounts/${cad.companyId}`);
  } else if (cad.companyKey) {
    revalidatePath(`/accounts/${encodeURIComponent(cad.companyKey)}`);
  }
  revalidatePath("/dashboard");
  revalidatePath("/pipeline");

  return { ok: true };
}

export async function markTouchComplete(touchId: number, outcome: string) {
  await requireAuth();
  await db
    .update(touches)
    .set({ completed: true, outcome })
    .where(eq(touches.id, touchId));
  revalidatePath("/today");
  return { ok: true };
}

// ---------- Notes ----------
const NoteSchema = z.object({
  companyKey: z.string().min(1), // accepts numeric id or legacy text key
  body: z.string().min(1),
});

export async function addNote(input: z.infer<typeof NoteSchema>) {
  await requireAuth();
  const data = NoteSchema.parse(input);
  const cad = await resolveCadence(data.companyKey);
  await db.insert(notes).values({
    companyId: cad.companyId,
    body: data.body,
    source: "crm",
  });
  // Revalidate by whichever path the caller used.
  const slug =
    cad.companyId != null
      ? String(cad.companyId)
      : encodeURIComponent(data.companyKey);
  revalidatePath(`/accounts/${slug}`);
  return { ok: true };
}

// ---------- Tasks ----------
const TaskSchema = z.object({
  companyKey: z.string().min(1),
  body: z.string().min(1),
  dueDate: z.string().nullable().optional(),
});

export async function addTask(input: z.infer<typeof TaskSchema>) {
  await requireAuth();
  const data = TaskSchema.parse(input);
  const cad = await resolveCadence(data.companyKey);
  await db.insert(tasks).values({
    companyId: cad.companyId,
    title: null,
    body: data.body,
    dueDate: data.dueDate ?? null,
    status: "open",
  });
  const slug =
    cad.companyId != null
      ? String(cad.companyId)
      : encodeURIComponent(data.companyKey);
  revalidatePath(`/accounts/${slug}`);
  return { ok: true };
}

export async function toggleTask(id: number, done: boolean) {
  await requireAuth();
  await db
    .update(tasks)
    .set({ status: done ? "done" : "open" })
    .where(eq(tasks.id, id));
  revalidatePath("/accounts");
  return { ok: true };
}

// ---------- Account lifecycle ----------
export async function disqualifyAccount(idOrKey: string, reason: string) {
  await requireAuth();
  const cad = await resolveCadence(idOrKey);
  if (cad.cadenceId != null) {
    await db
      .update(cadences)
      .set({
        status: "DISQUALIFIED",
        enrichmentNotes: reason,
      })
      .where(eq(cadences.id, cad.cadenceId));
  }
  if (cad.companyId != null) {
    await db
      .update(companies)
      .set({
        disqualified: true,
        disqualifiedReason: reason,
      })
      .where(eq(companies.id, cad.companyId));
    revalidatePath(`/accounts/${cad.companyId}`);
  }
  revalidatePath("/accounts");
  return { ok: true };
}

export async function promoteToActive(
  idOrKey: string | number,
  routeDay?: number,
) {
  await requireAuth();
  const cad = await resolveCadence(idOrKey);
  let resolvedRouteDay = routeDay;
  if (resolvedRouteDay == null) {
    resolvedRouteDay = routeDayForCounty(cad.county);
  }
  const startDate = new Date();
  const schedule = buildTouchSchedule(startDate, resolvedRouteDay);

  // Existing cadence? Update. Otherwise insert a new one if we have a companyId.
  let cadenceId = cad.cadenceId;
  if (cadenceId != null) {
    await db
      .update(cadences)
      .set({
        status: "active",
        routeDay: resolvedRouteDay,
        startDate: schedule[0],
      })
      .where(eq(cadences.id, cadenceId));
  } else if (cad.companyId != null) {
    const inserted = await db
      .insert(cadences)
      .values({
        companyId: cad.companyId,
        companyKey: cad.companyKey ?? `c${cad.companyId}`,
        status: "active",
        routeDay: resolvedRouteDay,
        startDate: schedule[0],
      })
      .returning({ id: cadences.id });
    cadenceId = inserted[0]?.id ?? null;
  }

  if (cadenceId != null) {
    // Wipe un-completed touches, then insert the 4-touch cadence.
    await db
      .delete(touches)
      .where(
        and(eq(touches.cadenceId, cadenceId), eq(touches.completed, false)),
      );
    const CHANNELS = ["call", "email", "linkedin", "drop"];
    const rows = schedule.flatMap((d, i) =>
      CHANNELS.map((ch) => ({
        cadenceId: cadenceId!,
        dayOffset: [0, 3, 7, 14][i],
        channel: ch,
        scheduledFor: d,
        completed: false,
      })),
    );
    if (rows.length > 0) {
      await db.insert(touches).values(rows);
    }
  }

  revalidatePath("/accounts");
  revalidatePath("/bench");
  revalidatePath("/today");
  return { ok: true };
}

// ---------- MEDDPICC ----------
const MeddpiccFields = [
  "stage",
  "mMetrics",
  "eEconBuyer",
  "d1DecisionCriteria",
  "d2DecisionProcess",
  "pPaperProcess",
  "iPain",
  "cChampion",
  "cmpCompetition",
  "nextAction",
] as const;
type MeddpiccField = (typeof MeddpiccFields)[number];

export async function updateMeddpicc(
  idOrKey: string,
  field: MeddpiccField,
  value: string,
) {
  await requireAuth();
  if (!MeddpiccFields.includes(field)) {
    throw new Error(`invalid field: ${field}`);
  }
  const cad = await resolveCadence(idOrKey);
  // Resolve which key to upsert against — prefer company_id, fall back to legacy company_key
  const whereExpr =
    cad.companyId != null
      ? eq(meddpicc.companyId, cad.companyId)
      : eq(meddpicc.companyKey, cad.companyKey ?? idOrKey);
  const existing = await db
    .select({ id: meddpicc.id })
    .from(meddpicc)
    .where(whereExpr)
    .limit(1);
  if (existing.length) {
    await db
      .update(meddpicc)
      .set({ [field]: value })
      .where(whereExpr);
  } else {
    await db.insert(meddpicc).values({
      companyId: cad.companyId,
      companyKey: cad.companyKey ?? idOrKey,
      [field]: value,
    } as any);
  }
  const slug =
    cad.companyId != null
      ? String(cad.companyId)
      : encodeURIComponent(idOrKey);
  revalidatePath(`/accounts/${slug}`);
  revalidatePath("/pipeline");
  return { ok: true };
}

const STAGE_NORM: Record<string, string> = {
  "discovery_scheduled": "discovery_scheduled",
  "discovery scheduled": "discovery_scheduled",
  "discovery_held": "discovery_held",
  "discovery held": "discovery_held",
  "proposal_sent": "proposal_sent",
  "proposal sent": "proposal_sent",
  "closed_won": "closed_won",
  "closed-won": "closed_won",
  "closed_lost": "closed_lost",
  "closed-lost": "closed_lost",
  "nurture": "nurture",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  discovery_scheduled: ["discovery_held", "nurture", "closed_lost"],
  discovery_held: ["proposal_sent", "nurture", "closed_lost"],
  proposal_sent: ["closed_won", "closed_lost", "nurture"],
  closed_won: [],
  closed_lost: ["nurture"],
  nurture: ["discovery_scheduled", "closed_lost"],
};

function normStage(s: string | null | undefined): string | null {
  if (!s) return null;
  return STAGE_NORM[s.toLowerCase().trim()] ?? null;
}

export async function moveMeddpiccStage(idOrKey: string, stage: string) {
  await requireAuth();
  const targetNorm = normStage(stage);
  if (!targetNorm) {
    return {
      ok: false as const,
      error: `invalid stage: ${stage}`,
    };
  }
  const cad = await resolveCadence(idOrKey);
  const whereExpr =
    cad.companyId != null
      ? eq(meddpicc.companyId, cad.companyId)
      : eq(meddpicc.companyKey, cad.companyKey ?? idOrKey);
  const existing = await db
    .select({ stage: meddpicc.stage })
    .from(meddpicc)
    .where(whereExpr)
    .limit(1);
  const currentNorm = existing.length ? normStage(existing[0].stage) : null;

  if (currentNorm) {
    const allowed = VALID_TRANSITIONS[currentNorm] ?? [];
    if (!allowed.includes(targetNorm) && currentNorm !== targetNorm) {
      return {
        ok: false as const,
        error: `invalid stage transition: ${currentNorm} -> ${targetNorm}`,
      };
    }
  } else {
    if (targetNorm !== "discovery_scheduled" && targetNorm !== "nurture") {
      return {
        ok: false as const,
        error: `cannot seed pipeline at stage: ${targetNorm}`,
      };
    }
  }

  return updateMeddpicc(idOrKey, "stage", stage);
}
