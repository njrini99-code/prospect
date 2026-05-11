"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      <NuqsAdapter>
        <TooltipProvider delayDuration={150}>{children}</TooltipProvider>
        <Toaster
          position="bottom-right"
          theme="dark"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast:
                "bg-card border border-border text-foreground shadow-lg",
              title: "text-sm font-semibold tracking-tight",
              description: "text-xs text-muted-foreground",
            },
          }}
        />
      </NuqsAdapter>
    </NextThemesProvider>
  );
}
