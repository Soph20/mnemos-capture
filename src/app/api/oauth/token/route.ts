import { NextRequest, NextResponse } from "next/server";
import {
  consumeOauthCode,
  getOauthClient,
  getUserById,
  recordRefreshToken,
  consumeRefreshToken,
  revokeRefreshFamily,
  deleteExpiredRefreshTokens,
} from "@/lib/db";
import {
  issueAccessToken,
  issueRefreshToken,
  verifyToken,
  verifyPkce,
  ACCESS_TOKEN_TTL_SECONDS,
  MCP_SCOPE,
} from "@/lib/oauth";

// OAuth 2.1 token endpoint. Public clients (PKCE, no secret).
// Supports the authorization_code and refresh_token grants.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Cache-Control": "no-store",
};

function tokenError(error: string, description?: string, status = 400): NextResponse {
  return NextResponse.json(
    { error, ...(description ? { error_description: description } : {}) },
    { status, headers: CORS },
  );
}

/** Accept both application/x-www-form-urlencoded (spec) and JSON bodies. */
async function readParams(req: NextRequest): Promise<URLSearchParams> {
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await req.json()) as Record<string, unknown>;
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") sp.set(k, v);
    return sp;
  }
  const text = await req.text();
  return new URLSearchParams(text);
}

async function issueTokens(
  userId: number,
  clientId: string,
  tokenVersion: number,
): Promise<NextResponse> {
  const accessToken = issueAccessToken(userId, clientId, tokenVersion);
  const refresh = issueRefreshToken(userId, clientId, tokenVersion);

  // Track the refresh token's id so it can be used exactly once.
  await recordRefreshToken(refresh.jti, userId, clientId, refresh.expiresAt);
  void deleteExpiredRefreshTokens().catch(() => {});

  return NextResponse.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refresh.token,
      scope: MCP_SCOPE,
    },
    { headers: CORS },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let params: URLSearchParams;
  try {
    params = await readParams(req);
  } catch {
    return tokenError("invalid_request", "Malformed request body.");
  }

  const grantType = params.get("grant_type");

  // ── authorization_code ──
  if (grantType === "authorization_code") {
    const code = params.get("code") ?? "";
    const redirectUri = params.get("redirect_uri") ?? "";
    const clientId = params.get("client_id") ?? "";
    const codeVerifier = params.get("code_verifier") ?? "";

    if (!code) return tokenError("invalid_request", "Missing code.");
    if (!codeVerifier) return tokenError("invalid_request", "Missing code_verifier (PKCE).");

    // Single-use: consume atomically.
    const stored = await consumeOauthCode(code);
    if (!stored) return tokenError("invalid_grant", "Authorization code is invalid or already used.");
    if (new Date(stored.expires_at).getTime() < Date.now()) {
      return tokenError("invalid_grant", "Authorization code has expired.");
    }
    if (stored.client_id !== clientId) {
      return tokenError("invalid_grant", "client_id does not match the authorization code.");
    }
    if (stored.redirect_uri !== redirectUri) {
      return tokenError("invalid_grant", "redirect_uri does not match the authorization request.");
    }
    if (!verifyPkce(codeVerifier, stored.code_challenge, stored.code_challenge_method)) {
      return tokenError("invalid_grant", "PKCE verification failed.");
    }

    const user = await getUserById(stored.user_id);
    if (!user) return tokenError("invalid_grant", "User no longer exists.");

    return issueTokens(stored.user_id, stored.client_id, user.token_version ?? 0);
  }

  // ── refresh_token ──
  if (grantType === "refresh_token") {
    const refreshToken = params.get("refresh_token") ?? "";
    const clientId = params.get("client_id") ?? "";

    const payload = verifyToken(refreshToken, "refresh");
    if (!payload) return tokenError("invalid_grant", "Refresh token is invalid or expired.");
    if (clientId && payload.c !== clientId) {
      return tokenError("invalid_grant", "client_id does not match the refresh token.");
    }
    if (!payload.jti) {
      // Pre-rotation token with no tracked id — cannot be made single-use.
      return tokenError("invalid_grant", "Refresh token is no longer valid; re-authorize.");
    }

    // Confirm the client and user still exist.
    const client = await getOauthClient(payload.c);
    if (!client) return tokenError("invalid_grant", "Client no longer registered.");
    const user = await getUserById(payload.u);
    if (!user) return tokenError("invalid_grant", "User no longer exists.");

    // A bumped token_version retires every token issued before the bump.
    if ((user.token_version ?? 0) !== payload.v) {
      return tokenError("invalid_grant", "Refresh token has been revoked.");
    }

    // Rotate: claim the token for single use. A second presentation means the
    // token leaked, so drop the whole family and force a fresh authorization.
    const claim = await consumeRefreshToken(payload.jti);
    if (claim.status === "reused") {
      await revokeRefreshFamily(payload.u, payload.c);
      return tokenError("invalid_grant", "Refresh token reuse detected; re-authorize.");
    }
    if (claim.status === "unknown") {
      return tokenError("invalid_grant", "Refresh token is invalid or expired.");
    }

    return issueTokens(payload.u, payload.c, user.token_version ?? 0);
  }

  return tokenError("unsupported_grant_type", `Unsupported grant_type: ${grantType ?? "(none)"}`);
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}
