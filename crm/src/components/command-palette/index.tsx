"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Sun,
  Users,
  Workflow,
  Boxes,
  BarChart3,
  Settings,
  Search,
} from "lucide-react";
import { useCommandPalette } from "./store";

export type CommandAccount = {
  id: number;
  name: string;
  county: string | null;
  primaryTrigger: string | null;
  dmName: string | null;
  score: number;
};

type Props = {
  accounts: CommandAccount[];
};

export function CommandPalette({ accounts }: Props) {
  const router = useRouter();
  const { open, setOpen } = useCommandPalette();
  const [q, setQ] = React.useState("");
  const [remote, setRemote] = React.useState<CommandAccount[]>([]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  // Live typeahead — fires after the indexed slice fails to surface results.
  React.useEffect(() => {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      setRemote([]);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/typeahead?q=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" },
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results: CommandAccount[] };
        if (!cancelled) setRemote(data.results ?? []);
      } catch {
        // best-effort — fall back to indexed slice
      }
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  // Merge indexed + remote, de-dupe by id
  const combined = React.useMemo(() => {
    const seen = new Set<number>();
    const out: CommandAccount[] = [];
    for (const a of accounts) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }
    for (const a of remote) {
      if (!seen.has(a.id)) {
        seen.add(a.id);
        out.push(a);
      }
    }
    return out;
  }, [accounts, remote]);

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Search accounts, jump to page, run action…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          <CommandItem onSelect={() => go("/today")}>
            <Sun className="h-4 w-4 text-amber-400" />
            <span>Today</span>
            <CommandShortcut>G T</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/accounts")}>
            <Users className="h-4 w-4 text-blue-400" />
            <span>Accounts</span>
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/pipeline")}>
            <Workflow className="h-4 w-4 text-emerald-400" />
            <span>Pipeline</span>
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/bench")}>
            <Boxes className="h-4 w-4 text-violet-400" />
            <span>Bench</span>
            <CommandShortcut>G B</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/dashboard")}>
            <BarChart3 className="h-4 w-4 text-rose-400" />
            <span>Dashboard</span>
            <CommandShortcut>G D</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => go("/settings")}>
            <Settings className="h-4 w-4 text-zinc-400" />
            <span>Settings</span>
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Accounts">
          {combined.slice(0, 60).map((a) => (
            <CommandItem
              key={a.id}
              value={`${a.name ?? ""} ${a.dmName ?? ""} ${a.county ?? ""}`}
              onSelect={() => go(`/accounts/${a.id}`)}
            >
              <Search className="h-4 w-4 text-muted-foreground" />
              <div className="flex flex-col items-start gap-0">
                <span className="font-medium">{a.name ?? "—"}</span>
                <span className="text-[10px] text-muted-foreground">
                  {a.county ?? "—"}
                  {a.dmName ? ` · ${a.dmName}` : ""}
                  {a.primaryTrigger ? ` · ${a.primaryTrigger}` : ""}
                </span>
              </div>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
