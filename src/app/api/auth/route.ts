import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getUserByGithubId } from "@/lib/db";
import { createSession } from "@/lib/session";

// PIN login for returning users (mobile quick access)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { pin: string; github_username: string };

  if (!body.pin || !body.github_username) {
    return NextResponse.json({ error: "PIN and username required" }, { status: 400 });
  }

  // Find user — we need to look up by username since we don't have github_id on the login form
  // This is a simplified lookup; in production you'd use a proper session
  const { sql } = await import("@vercel/postgres");
  const { rows } = await sql`
    SELECT * FROM users WHERE github_username = ${body.github_username} LIMIT 1
  `;
  const user = rows[0] as { id: number; pin_hash: string | null; github_id: number } | undefined;

  if (!user || !user.pin_hash) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  // Verify PIN
  const pinHash = crypto.createHash("sha256").update(body.pin).digest("hex");
  if (pinHash !== user.pin_hash) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  await createSession(user.id);
  return NextResponse.json({ ok: true });
}
