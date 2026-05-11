import { db } from "@/db/client";
import { sql } from "drizzle-orm";

/**
 * Liveness probe. Does NOT call requireAuth() — must be reachable from
 * any process (the middleware allowlists this path explicitly).
 */
export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return Response.json({
      ok: true,
      db: "connected",
      ts: new Date().toISOString(),
    });
  } catch (e: any) {
    return Response.json(
      {
        ok: false,
        db: "unreachable",
        error: e?.message ?? "unknown",
        ts: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
