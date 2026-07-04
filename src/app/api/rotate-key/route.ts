import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session";
import { updateUserApiKey } from "@/lib/db";

// Regenerate the MCP/CLI API key for the signed-in user.
// This is the only path (besides full onboarding) that mints a new api_key.
// Rotating overwrites the stored key, so any previously issued key stops working.
export async function POST(): Promise<NextResponse> {
  try {
    const user = await getSession();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Onboarding sets up the knowledge repo + LLM key. Without it, an MCP key is useless.
    if (!user.github_repo) {
      return NextResponse.json(
        { error: "Complete onboarding first — visit /onboard before generating an MCP key." },
        { status: 400 },
      );
    }

    const apiKey = `mnemos_${crypto.randomBytes(24).toString("hex")}`;
    await updateUserApiKey(user.id, apiKey);

    return NextResponse.json({ ok: true, apiKey });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to rotate key";
    return NextResponse.json({ error: `[rotate-key] ${message}` }, { status: 500 });
  }
}
