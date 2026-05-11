"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-3 max-w-md">
        <AlertTriangle className="h-10 w-10 text-rose-400 mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">
          Something broke
        </h1>
        <p className="text-sm text-muted-foreground">
          {error.message || "Unexpected error"}
        </p>
        {error.digest && (
          <p className="text-[10px] font-mono text-muted-foreground">
            digest: {error.digest}
          </p>
        )}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
