import { NextResponse } from "next/server";
import { authorizationServerMetadata } from "@/lib/oauth";

// RFC 8414 — served at /.well-known/oauth-authorization-server (via rewrite).
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

export function GET(): NextResponse {
  return NextResponse.json(authorizationServerMetadata(), { headers: CORS });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS });
}
