import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNowStrict, parseISO, isValid } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(d: string | Date | null | undefined, fmt = "MMM d") {
  if (!d) return "—";
  const dt = typeof d === "string" ? parseISO(d) : d;
  if (!isValid(dt)) return "—";
  return format(dt, fmt);
}

export function formatDateLong(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? parseISO(d) : d;
  if (!isValid(dt)) return "—";
  return format(dt, "EEE, MMM d, yyyy");
}

export function timeAgo(d: string | Date | null | undefined) {
  if (!d) return "—";
  const dt = typeof d === "string" ? parseISO(d) : d;
  if (!isValid(dt)) return "—";
  return formatDistanceToNowStrict(dt, { addSuffix: true });
}

export function initials(name: string | null | undefined) {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function scoreColor(score: number | null | undefined) {
  if (score == null) return "bg-zinc-800 text-zinc-400";
  const s = Number(score);
  if (s >= 80) return "bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/30";
  if (s >= 65) return "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20";
  if (s >= 50) return "bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/20";
  if (s >= 35) return "bg-amber-500/5 text-amber-400/80 ring-1 ring-amber-500/15";
  return "bg-rose-500/10 text-rose-400 ring-1 ring-rose-500/20";
}

export function triggerColor(trigger: string | null | undefined) {
  const t = (trigger || "").toLowerCase();
  if (t.includes("displacement") || t.includes("competing"))
    return "bg-blue-500/10 text-blue-300 ring-1 ring-blue-500/20";
  if (t.includes("tech") || t.includes("engineer"))
    return "bg-violet-500/10 text-violet-300 ring-1 ring-violet-500/20";
  if (t.includes("compliance") || t.includes("osha") || t.includes("5500"))
    return "bg-orange-500/10 text-orange-300 ring-1 ring-orange-500/20";
  if (t.includes("wc") || t.includes("renewal"))
    return "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20";
  if (t.includes("health") || t.includes("benefits"))
    return "bg-rose-500/10 text-rose-300 ring-1 ring-rose-500/20";
  return "bg-zinc-800/80 text-zinc-300 ring-1 ring-zinc-700";
}

export function statusColor(status: string | null | undefined) {
  const s = (status || "").toLowerCase();
  if (s.includes("won")) return "bg-emerald-500/15 text-emerald-300";
  if (s.includes("lost") || s.includes("disqualif"))
    return "bg-rose-500/15 text-rose-300";
  if (s.includes("active") || s.includes("scheduled"))
    return "bg-blue-500/15 text-blue-300";
  if (s.includes("warm") || s.includes("follow"))
    return "bg-amber-500/15 text-amber-300";
  if (s.includes("nurture")) return "bg-zinc-500/15 text-zinc-300";
  return "bg-zinc-800 text-zinc-400";
}

export function channelLabel(channel: string | null | undefined): string {
  if (!channel) return "—";
  const c = channel.toLowerCase();
  if (c === "email" || c === "e") return "Email";
  if (c === "call" || c === "phone") return "Call";
  if (c === "drop" || c === "field") return "Drop";
  if (c === "linkedin" || c === "li") return "LinkedIn";
  return channel;
}

export function num(n: number | string | null | undefined, digits = 0): string {
  if (n == null || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function estAnnualRev(ee: number | null | undefined) {
  if (!ee) return 0;
  return ee * 1500; // PEO admin fee rough estimate
}

export function getWeekStart(d = new Date()): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.getFullYear(), d.getMonth(), diff);
  return format(monday, "yyyy-MM-dd");
}
