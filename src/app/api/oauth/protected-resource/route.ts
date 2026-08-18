import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/oauth";

// RFC 9728 — served at /.well-known/oauth-protected-resource (via rewrite).
// Public, cacheable, CORS-open so any MCP client can discover the auth server.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(): NextResponse {
  return NextResponse.json(protectedResourceMetadata(), { headers: CORS });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}
