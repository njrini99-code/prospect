"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  /** Current pathname including the leading slash, e.g. "/bench". */
  basePath: string;
  /** Current query params other than `page` (used to preserve filters). */
  preserveParams?: Record<string, string | undefined>;
};

function buildHref(
  basePath: string,
  page: number,
  preserve: Record<string, string | undefined> = {},
) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(preserve)) {
    if (v) usp.set(k, v);
  }
  if (page > 1) usp.set("page", String(page));
  const q = usp.toString();
  return q ? `${basePath}?${q}` : basePath;
}

export function Pagination({
  page,
  pageSize,
  totalCount,
  hasNextPage,
  basePath,
  preserveParams,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(totalCount, page * pageSize);
  const prevHref = buildHref(basePath, Math.max(1, page - 1), preserveParams);
  const nextHref = buildHref(basePath, page + 1, preserveParams);

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
      <span>
        {start.toLocaleString()}–{end.toLocaleString()} of{" "}
        {totalCount.toLocaleString()} · page {page} / {totalPages}
      </span>
      <div className="flex items-center gap-1">
        <Link
          href={page > 1 ? prevHref : "#"}
          aria-disabled={page <= 1}
          className={cn(
            "h-7 inline-flex items-center gap-1 rounded-md border border-border px-2 hover:bg-zinc-900",
            page <= 1 && "opacity-40 pointer-events-none",
          )}
        >
          <ChevronLeft className="h-3 w-3" />
          Prev
        </Link>
        <Link
          href={hasNextPage ? nextHref : "#"}
          aria-disabled={!hasNextPage}
          className={cn(
            "h-7 inline-flex items-center gap-1 rounded-md border border-border px-2 hover:bg-zinc-900",
            !hasNextPage && "opacity-40 pointer-events-none",
          )}
        >
          Next
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}
