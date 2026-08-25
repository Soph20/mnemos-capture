import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { initDb } from "@/lib/db";
import { env } from "@/lib/env";

/** Constant-time string comparison, so the secret can't be recovered byte-by-byte. */
function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// One-time endpoint to create the users table.
// Call once after deploying: POST /api/init-db with the x-admin-secret header.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-admin-secret") ?? "";
  if (!timingSafeEqualStr(secret, env.adminSecret)) {
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
