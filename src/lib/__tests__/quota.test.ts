import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { CAPTURE_QUOTA, QUOTA_WINDOW_SECONDS } from "../rate-limit";

/**
 * consumeQuota talks to Postgres, so the arithmetic that isn't SQL is asserted
 * here and the wiring is asserted structurally — both capture paths must charge
 * the same budget, or a stolen MCP key simply uses the un-charged one.
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

describe("both capture paths are charged", () => {
  const web = fs.readFileSync(path.join(process.cwd(), "src/app/api/capture/route.ts"), "utf-8");
  const mcp = fs.readFileSync(path.join(process.cwd(), "src/app/api/mcp/route.ts"), "utf-8");

  it("throttles the web capture route", () => {
    expect(web).toContain("consumeQuota");
  });

  it("throttles the MCP capture tool — the likelier path for a stolen key", () => {
    expect(mcp).toContain("consumeQuota");
  });

  it("charges both against the same identifier, so one budget covers both", () => {
    const id = /capture:user:\$\{user\.id\}/;
    expect(web).toMatch(id);
    expect(mcp).toMatch(id);
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
