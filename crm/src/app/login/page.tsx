import { isAuthenticated } from "@/lib/auth";
import { redirect } from "next/navigation";
import { LoginForm } from "./login-form";
import { Zap, Target, Workflow, BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await isAuthenticated()) redirect("/today");

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
              <Zap className="h-4 w-4 text-emerald-950" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">
                ADP PEO
              </span>
              <span className="text-[10px] text-muted-foreground -mt-0.5">
                Eastern NC OS
              </span>
            </div>
          </div>
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome back, Nick.
            </h1>
            <p className="text-sm text-muted-foreground">
              Sign in to your territory operating system.
            </p>
          </div>
          <LoginForm />
          <p className="text-[11px] text-muted-foreground">
            Single-user app. Password is set via{" "}
            <code className="font-mono text-zinc-400">APP_PASSWORD</code> in
            your .env.local.
          </p>
        </div>
      </div>
      <div className="hidden lg:flex flex-col p-12 gradient-mesh relative overflow-hidden">
        <div className="flex-1 flex flex-col justify-center max-w-md mx-auto">
          <h2 className="text-4xl font-semibold tracking-tight text-balance">
            Your eastern NC PEO operating system.
          </h2>
          <p className="text-sm text-muted-foreground mt-3 leading-relaxed">
            Replace the spreadsheet sprawl. Run cadences, score triggers, log
            outcomes and close one deal in 30 days.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-3 text-sm">
            <Feature
              icon={<Target className="h-4 w-4 text-emerald-400" />}
              title="Trigger-scored"
              body="WC renewal, 5500, OSHA, multi-state, displacement."
            />
            <Feature
              icon={<Workflow className="h-4 w-4 text-emerald-400" />}
              title="Cadence-driven"
              body="D0, D3, D8, D15 across email, call, drop, LinkedIn."
            />
            <Feature
              icon={<BarChart3 className="h-4 w-4 text-emerald-400" />}
              title="Pipeline-honest"
              body="MEDDPICC stages, real conversion math, weekly KPIs."
            />
            <Feature
              icon={<Zap className="h-4 w-4 text-emerald-400" />}
              title="Field-ready"
              body="Tue/Wed/Thu drop routes, print-ready Today view."
            />
          </div>
        </div>
        <div className="text-[11px] text-zinc-600 font-mono">
          v0.1 · linear / attio / pipedrive vibes
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-4">
      <div className="flex items-center gap-2">
        {icon}
        <div className="text-sm font-medium">{title}</div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
        {body}
      </p>
    </div>
  );
}
