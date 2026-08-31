import { NextResponse } from "next/server";
import { destroySession } from "@/lib/session";

export async function POST(): Promise<NextResponse> {
  try {
    await destroySession();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to sign out";
    return NextResponse.json({ error: `[logout] ${message}` }, { status: 500 });
  }
}