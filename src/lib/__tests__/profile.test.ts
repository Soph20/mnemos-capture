import { describe, it, expect } from "vitest";
import {
  validateDisplayName,
  validateAvatarData,
  githubAvatarUrl,
  DISPLAY_NAME_MAX,
} from "../profile";

describe("validateDisplayName", () => {
  it("accepts a normal name", () => {
    expect(validateDisplayName("Soph")).toBeNull();
  });

  it("rejects empty", () => {
    expect(validateDisplayName("   ")).toMatch(/empty/);
  });

  it("rejects over-long names", () => {
    expect(validateDisplayName("a".repeat(DISPLAY_NAME_MAX + 1))).toMatch(/at most/);
  });
});

describe("validateAvatarData", () => {
  it("accepts a small jpeg data URL", () => {
    expect(validateAvatarData("data:image/jpeg;base64,/9j/4AAQ")).toBeNull();
  });

  it("rejects a non-image payload", () => {
    expect(validateAvatarData("data:text/plain;base64,abc")).toMatch(/JPEG/);
  });
});

describe("githubAvatarUrl", () => {
  it("points at the GitHub avatar CDN shape", () => {
    expect(githubAvatarUrl("Soph20")).toContain("github.com/Soph20.png");
  });
});
