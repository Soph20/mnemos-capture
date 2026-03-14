import { NextRequest, NextResponse } from "next/server";

const CAPTURE_SECRET = process.env.CAPTURE_SECRET ?? "";

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!CAPTURE_SECRET) {
    return NextResponse.json({ error: "CAPTURE_SECRET not configured" }, { status: 500 });
  }

  const body = await req.json() as { pin: string };

  if (body.pin !== CAPTURE_SECRET) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("meridian_auth", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
