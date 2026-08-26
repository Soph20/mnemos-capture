import { NextRequest, NextResponse } from "next/server";
import { createUser, getUserByGithubId } from "@/lib/db";
import { createSession } from "@/lib/session";
import { issueDeviceToken, DEVICE_COOKIE_NAME, deviceCookieOptions } from "@/lib/device";
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
    await createSession(user.id, user.token_version ?? 0);

    // If this login was initiated to resume an OAuth authorization request
    // (Claude connecting over MCP), send the browser back to that request.
    const oauthReturn = req.cookies.get("mnemos_oauth_return")?.value;

    let response: NextResponse;
    if (oauthReturn && oauthReturn.startsWith(`${env.appUrl}/api/oauth/authorize`)) {
      response = NextResponse.redirect(oauthReturn);
    } else if (user.github_repo) {
      // Redirect: onboard if no repo, otherwise home
      response = NextResponse.redirect(`${env.appUrl}/`);
    } else {
      response = NextResponse.redirect(`${env.appUrl}/onboard`);
    }

    response.cookies.delete("oauth_state");
    response.cookies.delete("mnemos_oauth_return");

    // Mark this device as GitHub-verified, so PIN quick-unlock is allowed here
    // (and only here). See lib/device for why the PIN is device-bound.
    response.cookies.set(
      DEVICE_COOKIE_NAME,
      issueDeviceToken(user.id, user.token_version ?? 0),
      deviceCookieOptions(),
    );

    return response;
  } catch (err) {
    console.error("OAuth callback error:", err);
    return NextResponse.redirect(`${env.appUrl}/login?error=server_error`);
  }
}
