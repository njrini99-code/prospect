"use client";

import * as React from "react";

type State = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const Ctx = React.createContext<State | null>(null);

export function CommandPaletteProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((v) => !v), []);
  const value = React.useMemo(() => ({ open, setOpen, toggle }), [open, toggle]);

  // Cmd/Ctrl+K
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCommandPalette<T = State>(
  selector: (s: State) => T = (s) => s as unknown as T,
): T {
  const ctx = React.useContext(Ctx);
  if (!ctx) {
    // Fallback no-op so non-shell pages don't crash
    return selector({ open: false, setOpen: () => {}, toggle: () => {} });
  }
  return selector(ctx);
}
