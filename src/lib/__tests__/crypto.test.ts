import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-session-secret-for-credential-encryption";
});

const { encrypt, decrypt, isEncrypted, hashApiKey } = await import("../crypto");

describe("encrypt / decrypt", () => {
  it("round-trips a credential", () => {
    const token = "gho_exampletoken1234567890";
    expect(decrypt(encrypt(token))).toBe(token);
  });

  it("produces a tagged, non-plaintext ciphertext", () => {
    const out = encrypt("gho_secret");
    expect(out.startsWith("enc:v1:")).toBe(true);
    expect(out).not.toContain("gho_secret");
    expect(isEncrypted(out)).toBe(true);
  });

  it("uses a fresh nonce — same input encrypts differently each time", () => {
    expect(encrypt("same-value")).not.toBe(encrypt("same-value"));
  });

  it("passes a legacy plaintext row through unchanged", () => {
    // Rows written before encryption existed must keep working.
    expect(decrypt("gho_legacy_plaintext")).toBe("gho_legacy_plaintext");
    expect(isEncrypted("gho_legacy_plaintext")).toBe(false);
  });

  it("returns null for a null or empty stored value", () => {
    expect(decrypt(null)).toBeNull();
    expect(decrypt("")).toBeNull();
  });

  it("rejects tampered ciphertext rather than returning garbage", () => {
    const good = encrypt("gho_secret");
    const body = good.slice("enc:v1:".length);
    const raw = Buffer.from(body, "base64");
    raw[raw.length - 1] ^= 0xff; // flip a bit in the ciphertext
    expect(decrypt("enc:v1:" + raw.toString("base64"))).toBeNull();
  });

  it("returns null on a truncated ciphertext", () => {
    expect(decrypt("enc:v1:" + Buffer.from("short").toString("base64"))).toBeNull();
  });

  it("round-trips unicode and empty strings", () => {
    expect(decrypt(encrypt("clé—ключ"))).toBe("clé—ключ");
    expect(decrypt(encrypt(""))).toBe("");
  });
});

describe("hashApiKey", () => {
  it("is deterministic so it can be used for lookup", () => {
    expect(hashApiKey("mnemos_abc")).toBe(hashApiKey("mnemos_abc"));
  });

  it("differs for different keys", () => {
    expect(hashApiKey("mnemos_abc")).not.toBe(hashApiKey("mnemos_abd"));
  });

  it("never contains the key itself", () => {
    expect(hashApiKey("mnemos_supersecret")).not.toContain("supersecret");
  });

  it("is tagged so hashed and legacy plaintext rows are distinguishable", () => {
    expect(hashApiKey("mnemos_abc").startsWith("sha256:")).toBe(true);
  });
});
