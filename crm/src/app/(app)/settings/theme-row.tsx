"use client";

import { useTheme } from "next-themes";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sun, Moon } from "lucide-react";

export function ThemeRow() {
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  return (
    <div className="flex items-center justify-between">
      <div className="space-y-0.5">
        <Label className="text-sm font-semibold text-foreground">Appearance</Label>
        <p className="text-[11px] text-muted-foreground">
          Dark mode is the default. Light mode works too.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
        <Switch
          checked={dark}
          onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
        />
        <Moon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
    </div>
  );
}
