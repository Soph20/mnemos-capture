import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByGithubId } from "@/lib/db";
import { createSession } from "@/lib/session";

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

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Validate state
  if (!state || !storedState || state !== storedState) {
    return NextResponse.redirect(`${appUrl}/login?error=invalid_state`);
  }

  if (!code) {
    return NextResponse.redirect(`${appUrl}/login?error=no_code`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });

    const tokenData = (await tokenRes.json()) as GithubTokenResponse;

    if (!tokenData.access_token) {
      return NextResponse.redirect(`${appUrl}/login?error=token_failed`);
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

    // Clear OAuth state cookie
    const response = user.github_repo
      ? NextResponse.redirect(`${appUrl}/`)
      : NextResponse.redirect(`${appUrl}/onboard`);

    response.cookies.delete("oauth_state");
    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${appUrl}/login?error=server_error`);
  }
}
