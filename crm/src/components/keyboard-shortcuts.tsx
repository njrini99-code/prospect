"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const GOTO_MAP: Record<string, string> = {
  t: "/today",
  a: "/accounts",
  p: "/pipeline",
  b: "/bench",
  d: "/dashboard",
  s: "/settings",
};

export function KeyboardShortcuts() {
  const router = useRouter();
  const [showHelp, setShowHelp] = React.useState(false);
  const lastG = React.useRef<number>(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inField =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (inField) return;

      if (e.key === "?") {
        e.preventDefault();
        setShowHelp(true);
        return;
      }
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      const now = Date.now();
      if (e.key.toLowerCase() === "g") {
        lastG.current = now;
        return;
      }
      if (now - lastG.current < 800) {
        const dest = GOTO_MAP[e.key.toLowerCase()];
        if (dest) {
          e.preventDefault();
          router.push(dest);
          lastG.current = 0;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <Dialog open={showHelp} onOpenChange={setShowHelp}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="text-sm space-y-3">
          <Section title="Global">
            <Row keys={["⌘", "K"]} desc="Open command palette" />
            <Row keys={["?"]} desc="Show this help" />
            <Row keys={["Esc"]} desc="Close any modal" />
          </Section>
          <Section title="Navigation (press G, then…)">
            <Row keys={["G", "T"]} desc="Today" />
            <Row keys={["G", "A"]} desc="Accounts" />
            <Row keys={["G", "P"]} desc="Pipeline" />
            <Row keys={["G", "B"]} desc="Bench" />
            <Row keys={["G", "D"]} desc="Dashboard" />
            <Row keys={["G", "S"]} desc="Settings" />
          </Section>
          <Section title="On lists">
            <Row keys={["J", "K"]} desc="Navigate up/down" />
            <Row keys={["E"]} desc="Log outcome on focused row" />
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({ keys, desc }: { keys: string[]; desc: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{desc}</span>
      <div className="flex items-center gap-1">
        {keys.map((k, i) => (
          <kbd
            key={i}
            className="inline-flex items-center justify-center rounded border border-border bg-card px-1.5 h-5 min-w-[20px] font-mono text-[10px]"
          >
            {k}
          </kbd>
        ))}
      </div>
    </div>
  );
}
