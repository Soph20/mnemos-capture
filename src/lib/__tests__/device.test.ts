import { describe, it, expect, beforeAll } from "vitest";
import crypto from "crypto";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-for-device-binding";
});

const { issueDeviceToken, verifyDeviceToken, DEVICE_MAX_AGE } = await import("../device");

describe("device token", () => {
  it("round-trips a device binding", () => {
    const payload = verifyDeviceToken(issueDeviceToken(42, 3));
    expect(payload).not.toBeNull();
    expect(payload!.u).toBe(42);
    expect(payload!.v).toBe(3);
  });

  it("rejects a tampered payload", () => {
    const token = issueDeviceToken(1, 0);
    const sig = token.split(".")[2]!;
    const forged = Buffer.from(
      JSON.stringify({ u: 999, v: 0, exp: 9999999999 }),
    ).toString("base64url");
    expect(verifyDeviceToken(`d1.${forged}.${sig}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    const body = Buffer.from(JSON.stringify({ u: 5, v: 0, exp: past })).toString("base64url");
    const sig = crypto
      .createHmac("sha256", "test-secret-for-device-binding")
      .update(body)
      .digest("base64url");
    expect(verifyDeviceToken(`d1.${body}.${sig}`)).toBeNull();
  });

  it("rejects a token from a different version prefix", () => {
    const token = issueDeviceToken(1, 0);
    expect(verifyDeviceToken(token.replace(/^d1\./, "d2."))).toBeNull();
  });

  it("rejects garbage", () => {
    for (const bad of ["", "not-a-token", "d1.only-two", "d1..", "a.b.c"]) {
      expect(verifyDeviceToken(bad)).toBeNull();
    }
  });

  it("carries token_version so revocation un-trusts the device", () => {
    // The route compares this against the user's current token_version.
    const payload = verifyDeviceToken(issueDeviceToken(7, 4));
    expect(payload!.v).toBe(4);
  });

  it("is long-lived — it marks a known device, not a session", () => {
    const payload = verifyDeviceToken(issueDeviceToken(1, 0))!;
    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    expect(ttl).toBeGreaterThan(DEVICE_MAX_AGE - 60);
  });
});

describe("PIN route is device-gated", () => {
  const source = require("fs").readFileSync(
    require("path").join(process.cwd(), "src/app/api/auth/route.ts"),
    "utf-8",
  ) as string;

  // Compare call sites inside the POST handler, not first occurrence anywhere —
  // the import block lists these names in an unrelated order.
  const postBody = source.slice(source.indexOf("export async function POST"));

  it("requires a verified device before any PIN check", () => {
    const deviceIdx = postBody.indexOf("await getDevicePayload()");
    const verifyIdx = postBody.indexOf("verifyPin(pin");
    expect(deviceIdx).toBeGreaterThan(-1);
    expect(verifyIdx).toBeGreaterThan(-1);
    expect(deviceIdx).toBeLessThan(verifyIdx);
  });

  it("bails out before the PIN check when the device is unverified", () => {
    expect(postBody).toMatch(/if \(!device\)[\s\S]{0,160}needsGithub/);
  });

  it("takes no username from the request body", () => {
    // github_username may still appear as a display value in GET, but must
    // never be read from the POST body as part of the credential.
    expect(postBody).not.toContain("github_username");
    expect(source).not.toContain("getUserByUsername");
    expect(source).not.toContain("body.github_username");
  });

  it("re-checks token_version so revocation un-trusts devices", () => {
    expect(source).toContain("token_version");
  });
});
