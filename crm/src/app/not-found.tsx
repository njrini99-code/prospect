import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-3">
        <Compass className="h-10 w-10 text-emerald-400 mx-auto" />
        <h1 className="text-2xl font-semibold tracking-tight">Not found</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          That URL doesn't match an account or page in your territory.
        </p>
        <Button asChild>
          <Link href="/today">Back to Today</Link>
        </Button>
      </div>
    </div>
  );
}
