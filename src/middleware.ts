import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = ["/login", "/api/auth", "/api/auth/github", "/api/auth/callback", "/api/init-db", "/api/mcp"];

export function middleware(req: NextRequest): NextResponse {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie
  const session = req.cookies.get("mnemos_session");
  if (!session) {
    // API routes must always return JSON — never redirect to the /login HTML page.
    // A 307 → 200 HTML login page makes client `res.json()` throw
    // "Unrecognized token '<'" / "The string did not match the expected pattern."
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", req.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|svg|jpg|jpeg|gif|webp|ico)).*)"],
};
