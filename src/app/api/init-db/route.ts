import { NextRequest, NextResponse } from "next/server";
import { initDb } from "@/lib/db";
import { env } from "@/lib/env";

// One-time endpoint to create the users table.
// Call once after deploying: POST /api/init-db with the x-admin-secret header.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== env.adminSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await initDb();
    return NextResponse.json({ ok: true, message: "Database initialized" });
  } catch (err) {
    console.error("DB init error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to initialize" },
      { status: 500 },
    );
  }
}
