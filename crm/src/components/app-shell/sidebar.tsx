"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sun,
  LayoutDashboard,
  Users,
  Workflow,
  Boxes,
  BarChart3,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/today", label: "Today", icon: Sun, shortcut: "G T" },
  { href: "/accounts", label: "Accounts", icon: Users, shortcut: "G A" },
  { href: "/pipeline", label: "Pipeline", icon: Workflow, shortcut: "G P" },
  { href: "/bench", label: "Bench", icon: Boxes, shortcut: "G B" },
  { href: "/dashboard", label: "Dashboard", icon: BarChart3, shortcut: "G D" },
  { href: "/settings", label: "Settings", icon: Settings, shortcut: "G S" },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card/30">
      <div className="h-14 flex items-center gap-2 px-4 border-b border-border">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
          <Zap className="h-4 w-4 text-emerald-950" strokeWidth={2.5} />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-sm font-semibold tracking-tight">ADP PEO</span>
          <span className="text-[10px] text-muted-foreground -mt-0.5">
            Eastern NC OS
          </span>
        </div>
      </div>
      <nav className="flex-1 p-2 space-y-0.5">
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname?.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm transition-colors relative",
                active
                  ? "bg-emerald-500/10 text-emerald-300"
                  : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-emerald-400" />
              )}
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              <kbd className="hidden group-hover:inline-flex text-[9px] font-mono text-muted-foreground/60 tracking-widest">
                {item.shortcut}
              </kbd>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t border-border">
        <div className="rounded-md border border-emerald-500/20 bg-emerald-500/5 p-2.5">
          <div className="text-[10px] uppercase tracking-wider text-emerald-400 font-semibold">
            30-day goal
          </div>
          <div className="text-sm font-semibold mt-0.5 tracking-tight">
            Close 1 deal
          </div>
          <div className="text-[10px] text-muted-foreground mt-0.5">
            Eastern NC TotalSource
          </div>
        </div>
      </div>
    </aside>
  );
}
