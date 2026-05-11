import { requireAuth } from "@/lib/auth";
import { Sidebar } from "@/components/app-shell/sidebar";
import { TopBar } from "@/components/app-shell/topbar";
import { CommandPaletteProvider } from "@/components/command-palette/store";
import { CommandPalette } from "@/components/command-palette";
import { KeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { topCompaniesForCommandPalette } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAuth();

  // Top-200 qualified companies for the command palette mount payload.
  // The palette also calls /api/typeahead for live search beyond the 200.
  const accounts = await topCompaniesForCommandPalette(200);

  return (
    <CommandPaletteProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-6 overflow-x-hidden">{children}</main>
        </div>
        <CommandPalette accounts={accounts} />
        <KeyboardShortcuts />
      </div>
    </CommandPaletteProvider>
  );
}
