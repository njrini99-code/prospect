"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Command, ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useCommandPalette } from "@/components/command-palette/store";

export function TopBar() {
  const { theme, setTheme } = useTheme();
  const pathname = usePathname();
  const setOpen = useCommandPalette((s) => s.setOpen);

  const crumbs = (pathname || "/").split("/").filter(Boolean);

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-full items-center px-4 gap-3">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center text-xs text-muted-foreground"
        >
          <Link href="/today" className="hover:text-foreground">
            Home
          </Link>
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="h-3 w-3 mx-1.5 text-zinc-700" />
              <Link
                href={"/" + crumbs.slice(0, i + 1).join("/")}
                className="hover:text-foreground capitalize"
              >
                {decodeURIComponent(c).replace(/-/g, " ")}
              </Link>
            </React.Fragment>
          ))}
        </nav>
        <div className="flex-1" />
        <button
          onClick={() => setOpen(true)}
          className="hidden sm:flex items-center gap-2 h-8 rounded-md border border-border bg-card/50 px-2.5 text-xs text-muted-foreground hover:bg-card transition-colors"
        >
          <Command className="h-3.5 w-3.5" />
          <span>Search or run…</span>
          <kbd className="ml-2 inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px]">
            <span>⌘</span>K
          </kbd>
        </button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
