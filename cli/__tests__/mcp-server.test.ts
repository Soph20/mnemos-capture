import { describe, it, expect } from "vitest";
import { interpretResponse } from "../mcp-server";

/**
 * The proxy used to call res.json() directly, so any non-JSON reply surfaced in
 * the user's MCP client as "Unexpected token '<'" — the same opaque failure
 * CLAUDE.md documents on the browser side, with no hint that the server had
 * actually returned a 500 or a block page.
 */
describe("interpretResponse", () => {
  it("parses a normal JSON-RPC reply", () => {
    const r = interpretResponse(200, "application/json", '{"jsonrpc":"2.0","id":1,"result":{}}');
    expect(r).toHaveProperty("data");
    expect((r as { data: Record<string, unknown> }).data.id).toBe(1);
  });

  it("names the status instead of a parse error when HTML comes back", () => {
    const html = "<!DOCTYPE html><html><body>Internal Server Error</body></html>";
    const r = interpretResponse(500, "text/html; charset=utf-8", html) as { error: string };
    expect(r.error).toContain("HTTP 500");
    expect(r.error).toContain("non-JSON");
    expect(r.error).not.toContain("Unexpected token");
  });

  it("includes a snippet of the body so the cause is visible", () => {
    const r = interpretResponse(403, "text/plain", "Host not in allowlist: example.com") as {
      error: string;
    };
    expect(r.error).toContain("Host not in allowlist");
  });

  it("collapses whitespace and truncates a long body", () => {
    const r = interpretResponse(502, "text/html", "x\n\n   y" + "z".repeat(500)) as {
      error: string;
    };
    expect(r.error).toContain("x y");
    expect(r.error.length).toBeLessThan(300);
  });

  it("handles a missing content-type without crashing", () => {
    const r = interpretResponse(504, null, "gateway timeout") as { error: string };
    expect(r.error).toContain("HTTP 504");
  });

  it("reports malformed JSON distinctly from non-JSON", () => {
    const r = interpretResponse(200, "application/json", "{not valid") as { error: string };
    expect(r.error).toContain("malformed JSON");
  });

  it("does not mistake an empty body for a parse failure message", () => {
    const r = interpretResponse(204, "text/plain", "") as { error: string };
    expect(r.error).toContain("HTTP 204");
    expect(r.error.endsWith(")")).toBe(true); // no trailing empty snippet
  });
});
