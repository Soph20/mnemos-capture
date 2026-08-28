import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CAPTURE_QUOTA, QUOTA_WINDOW_SECONDS } from "../rate-limit";

/**
 * consumeQuota talks to Postgres, so the arithmetic that isn't SQL is asserted
 * here and the web route's wiring is asserted structurally — its handler is a
 * route export that cannot be imported without a NextRequest.
 *
 * The MCP side used to be grepped the same way, because its handler was
 * module-private inside the route. It now lives in lib/mcp/handlers and is
 * covered behaviorally in mcp-capture-quota.test.ts — including the ordering
 * this file can only approximate with indexOf.
 */
describe("capture quota constants", () => {
  it("is generous for a human and bounded for a script", () => {
    expect(CAPTURE_QUOTA).toBeGreaterThan(10);
    expect(CAPTURE_QUOTA).toBeLessThanOrEqual(1000);
  });

  it("uses a one-hour window", () => {
    expect(QUOTA_WINDOW_SECONDS).toBe(3600);
  });
});

describe("the web capture path is charged", () => {
  const web = fs.readFileSync(path.join(process.cwd(), "src/app/api/capture/route.ts"), "utf-8");

  it("throttles the web capture route", () => {
    expect(web).toContain("consumeQuota");
  });

  it("charges against the shared identifier, so one budget covers both paths", () => {
    expect(web).toMatch(/capture:user:\$\{user\.id\}/);
  });

  it("returns 429 with Retry-After on the HTTP path", () => {
    expect(web).toContain("429");
    expect(web).toContain("Retry-After");
  });

  it("charges only after validation, so bad requests don't consume quota", () => {
    // The content check must come before the quota is spent.
    expect(web.indexOf("content is required")).toBeLessThan(web.indexOf("consumeQuota("));
  });
});
