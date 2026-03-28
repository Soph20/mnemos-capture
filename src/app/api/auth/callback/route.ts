import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByGithubId } from "@/lib/db";
import { createSession } from "@/lib/session";
import { env } from "@/lib/env";

interface GithubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface GithubUser {
  id: number;
  login: string;
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const storedState = req.cookies.get("oauth_state")?.value;

  // Validate CSRF state
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${env.appUrl}/login?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${env.appUrl}/login?error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        client_id: env.githubClientId,
        client_secret: env.githubClientSecret,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as GithubTokenResponse;

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${env.appUrl}/login?error=token_failed`);
    }

    // Get GitHub user info
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github+json",
      },
    });

    const ghUser = (await userRes.json()) as GithubUser;

    // Create or update user in DB
    const user = await createUser(ghUser.id, ghUser.login, tokenData.access_token);

    // Create session
    await createSession(user.id);

    // Redirect: onboard if no repo, otherwise home
    const response = user.github_repo
      ? NextResponse.redirect(`${env.appUrl}/`)
      : NextResponse.redirect(`${env.appUrl}/onboard`);

    response.cookies.delete("oauth_state");
    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${env.appUrl}/login?error=server_error`);
  }
}
