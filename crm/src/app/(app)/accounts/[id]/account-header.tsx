"use client";

import * as React from "react";
import { Activity, ExternalLink, Linkedin, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TouchLogger } from "@/components/touch-logger";
import { scoreColor, statusColor, triggerColor, num } from "@/lib/utils";
import type { Account } from "@/db/schema";

export function AccountHeader({ account }: { account: Account }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="border-b border-border pb-5">
      <div className="flex items-start gap-4">
        <div
          className={
            "h-12 w-12 shrink-0 rounded-lg flex items-center justify-center text-lg font-mono font-semibold " +
            scoreColor(account.score ? Number(account.score) : null)
          }
        >
          {account.score ? Number(account.score).toFixed(0) : "—"}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight truncate">
            {account.company}
          </h1>
          <div className="flex items-center flex-wrap gap-2 mt-2">
            {account.status && (
              <Badge
                className={
                  "text-[10px] font-medium ring-0 border-0 " +
                  statusColor(account.status)
                }
              >
                {account.status}
              </Badge>
            )}
            {account.primaryTrigger && (
              <span
                className={
                  "rounded-md px-1.5 py-0.5 text-[10px] font-medium " +
                  triggerColor(account.primaryTrigger)
                }
              >
                {account.primaryTrigger}
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {account.county || "—"} county · {num(account.ee)} EE
              {account.naics ? ` · NAICS ${account.naics}` : ""}
            </span>
            {account.website && (
              <a
                href={
                  account.website.startsWith("http")
                    ? account.website
                    : `https://${account.website}`
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline"
              >
                <Globe className="h-3 w-3" />
                {account.website.replace(/^https?:\/\//, "").replace(/^www\./, "")}
              </a>
            )}
            {account.linkedinUrl && (
              <a
                href={account.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:underline"
              >
                <Linkedin className="h-3 w-3" />
                LinkedIn
                <ExternalLink className="h-2.5 w-2.5" />
              </a>
            )}
          </div>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Activity className="h-3.5 w-3.5" />
          Take action
        </Button>
        <TouchLogger
          open={open}
          onOpenChange={setOpen}
          companyKey={account.companyKey ?? String(account.id ?? "")}
          company={account.company ?? account.name ?? ""}
        />
      </div>
    </div>
  );
}
