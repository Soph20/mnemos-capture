import { NextResponse } from "next/server";
import crypto from "crypto";
import { env } from "@/lib/env";

export async function GET(): Promise<NextResponse> {
  const state = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: `${env.appUrl}/api/auth/callback`,
    scope: "repo",
    state,
  });

  const response = NextResponse.redirect(
    `https://github.com/login/oauth/authorize?${params.toString()}`,
  );

  response.cookies.set("oauth_state", state, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: 600, // 10 minutes
    path: "/",
  });

  return response;
}
