import { NextResponse } from "next/server";
import crypto from "crypto";

export async function GET(): Promise<NextResponse> {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GITHUB_CLIENT_ID not configured" }, { status: 500 });
  }

  // Generate state for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/auth/callback`,
    scope: "repo",
    state,
  });

  const response = NextResponse.redirect(`https://github.com/login/oauth/authorize?${params.toString()}`);

  // Store state in cookie for verification
  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
