"use client";

import * as React from "react";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Mail, PhoneCall, Linkedin, MapPin } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
  SheetFooter,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { logOutcome } from "@/app/actions";

const OUTCOMES = [
  { v: "NO_ANSWER", label: "No answer" },
  { v: "LEFT_VM", label: "Left voicemail" },
  { v: "REACHED_DM", label: "Reached DM" },
  { v: "INTERESTED", label: "Interested — follow-up" },
  { v: "MEETING_BOOKED", label: "Meeting booked" },
  { v: "DISCOVERY_HELD", label: "Discovery held" },
  { v: "NOT_INTERESTED", label: "Not interested" },
  { v: "DEAD", label: "Dead / wrong info" },
  { v: "DROP_COMPLETED", label: "Drop completed" },
  { v: "EMAIL_SENT", label: "Email sent" },
  { v: "EMAIL_REPLIED", label: "Email replied" },
];

const CHANNELS = [
  { v: "call", label: "Call", icon: PhoneCall },
  { v: "email", label: "Email", icon: Mail },
  { v: "linkedin", label: "LinkedIn", icon: Linkedin },
  { v: "drop", label: "Drop", icon: MapPin },
];

type Props = {
  companyKey: string;
  company: string;
  touchId?: number;
  defaultChannel?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /**
   * Optional optimistic-update callback. If provided, the parent's touch
   * list is updated synchronously before the server confirms. On error,
   * we call this again with `revert: true` so the parent can roll back.
   */
  onOptimisticLog?: (
    payload: { touchId?: number; outcome: string; revert?: boolean },
  ) => void;
};

export function TouchLogger({
  companyKey,
  company,
  touchId,
  defaultChannel,
  trigger,
  open: openProp,
  onOpenChange,
  onOptimisticLog,
}: Props) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = openProp ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;

  const [channel, setChannel] = React.useState(defaultChannel || "call");
  const [outcome, setOutcome] = React.useState("REACHED_DM");
  const [notes, setNotes] = React.useState("");
  const [broker, setBroker] = React.useState("");
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      // Fire optimistic update inside the same transition so React keeps
      // it visible until the server work resolves.
      onOptimisticLog?.({ touchId, outcome });
      try {
        await logOutcome({
          touchId,
          companyKey,
          channel,
          outcome,
          notes: notes || null,
          brokerCaptured: broker || null,
        });
        toast.success("Outcome logged", {
          description: `${company} · ${outcome}`,
        });
        setNotes("");
        setBroker("");
        setOpen(false);
      } catch (e: any) {
        // Snap back the optimistic update.
        onOptimisticLog?.({ touchId, outcome, revert: true });
        toast.error("Failed to log outcome", {
          description: e?.message ?? "Unknown error",
        });
      }
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Log a touch</SheetTitle>
          <SheetDescription className="font-mono text-xs">
            {company}
          </SheetDescription>
        </SheetHeader>
        <div className="px-6 flex-1 space-y-4 overflow-y-auto">
          <div>
            <Label>Channel</Label>
            <div className="grid grid-cols-4 gap-2 mt-1.5">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                const active = channel === c.v;
                return (
                  <button
                    key={c.v}
                    type="button"
                    onClick={() => setChannel(c.v)}
                    className={
                      "flex flex-col items-center justify-center gap-1 rounded-md border p-2 transition-colors " +
                      (active
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-border bg-card hover:bg-zinc-800/50 text-zinc-400")
                    }
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px]">{c.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Outcome</Label>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => (
                  <SelectItem key={o.v} value={o.v}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Quick context, snippets from the call…"
              className="mt-1.5"
              rows={4}
            />
          </div>
          <div>
            <Label>Broker captured (optional)</Label>
            <Input
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              placeholder="Their current broker, if disclosed"
              className="mt-1.5"
            />
          </div>
        </div>
        <SheetFooter>
          <SheetClose asChild>
            <Button variant="outline">Cancel</Button>
          </SheetClose>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Log outcome
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
