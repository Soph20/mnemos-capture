import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Serve the OAuth discovery documents from their spec-mandated .well-known
  // paths by rewriting to concrete API routes. MCP clients (Claude iOS/desktop/web)
  // probe these to discover how to authenticate against /api/mcp.
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource",
        destination: "/api/oauth/protected-resource",
      },
      // Path-suffixed variant some clients request (RFC 9728 §3.1).
      {
        source: "/.well-known/oauth-protected-resource/:path*",
        destination: "/api/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/api/oauth/authorization-server",
      },
      {
        source: "/.well-known/oauth-authorization-server/:path*",
        destination: "/api/oauth/authorization-server",
      },
    ];
  },
};

export default nextConfig;
