import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { updateUserPin } from "@/lib/db";
import { hashPin, validatePin, verifyPin } from "@/lib/pin";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { currentPin?: unknown; newPin?: unknown };
  try {
    body = await req.json() as { currentPin?: unknown; newPin?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const currentPin = typeof body.currentPin === "string" ? body.currentPin : "";
  const newPin = typeof body.newPin === "string" ? body.newPin : "";

  if (!user.pin_hash || !verifyPin(currentPin, user.pin_hash)) {
    return NextResponse.json({ error: "Current PIN is incorrect." }, { status: 401 });
  }

  const invalid = validatePin(newPin);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

  if (currentPin === newPin) {
    return NextResponse.json({ error: "Choose a different PIN." }, { status: 400 });
  }

  await updateUserPin(user.id, hashPin(newPin));
  return NextResponse.json({ ok: true });
}
