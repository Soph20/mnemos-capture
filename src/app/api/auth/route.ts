import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getUserByUsername } from "@/lib/db";
import { createSession } from "@/lib/session";

// PIN login for returning users (mobile quick access)
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as { pin: string; github_username: string };

  if (!body.pin || !body.github_username) {
    return NextResponse.json({ error: "PIN and username required" }, { status: 400 });
  }

  const user = await getUserByUsername(body.github_username);

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
