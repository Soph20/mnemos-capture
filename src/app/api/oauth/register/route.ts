import { NextRequest, NextResponse } from "next/server";
import { createOauthClient, getOauthClient } from "@/lib/db";
import { randomClientId } from "@/lib/oauth";

// RFC 7591 — OAuth 2.0 Dynamic Client Registration.
// MCP clients (Claude) register themselves before starting the authorization flow.
// We only support public clients using PKCE (token_endpoint_auth_method: "none"),
// so no client secret is issued.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

interface RegistrationRequest {
  redirect_uris?: unknown;
  client_name?: unknown;
}

function isHttpsOrLoopback(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return true;
    // Allow http only for loopback (native app local redirect) and custom schemes.
    if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
    // Custom app schemes (e.g. claude://) are permitted for native clients.
    if (u.protocol !== "http:" && u.protocol !== "https:") return true;
    return false;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: RegistrationRequest;
  try {
    body = (await req.json()) as RegistrationRequest;
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Body must be JSON." },
      { status: 400, headers: CORS },
    );
  }

  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === "string")
    : [];

  if (redirectUris.length === 0) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "At least one redirect_uri is required." },
      { status: 400, headers: CORS },
    );
  }

  if (!redirectUris.every(isHttpsOrLoopback)) {
    return NextResponse.json(
      { error: "invalid_redirect_uri", error_description: "redirect_uris must be https, loopback, or a custom app scheme." },
      { status: 400, headers: CORS },
    );
  }

  const clientName = typeof body.client_name === "string" ? body.client_name : null;

  // Retry on the astronomically unlikely id collision.
  let clientId = randomClientId();
  if (await getOauthClient(clientId)) clientId = randomClientId();

  await createOauthClient(clientId, clientName, redirectUris);

  return NextResponse.json(
    {
      client_id: clientId,
      client_name: clientName ?? undefined,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      client_id_issued_at: Math.floor(Date.now() / 1000),
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}
