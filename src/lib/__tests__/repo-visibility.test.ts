import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/**
 * The knowledge hub holds everything a user captures, so world-readable is not
 * a default anyone would knowingly choose. The repo-creation call lives inside
 * an API route (not an exported pure function), so this guards the default at
 * the source level — enough to catch a silent regression back to `private: false`.
 */
const routeSource = fs.readFileSync(
  path.join(process.cwd(), "src/app/api/onboard/route.ts"),
  "utf-8",
);

describe("knowledge repo visibility", () => {
  it("never hardcodes a public repo", () => {
    expect(routeSource).not.toContain("private: false");
  });

  it("derives visibility from the opt-in flag", () => {
    expect(routeSource).toContain("private: !isPublic");
  });

  it("defaults the opt-in to false", () => {
    expect(routeSource).toMatch(/isPublic\s*=\s*false/);
  });

  it("only treats an explicit boolean true as opting in", () => {
    // Guards against a truthy string like "false" flipping a hub public.
    expect(routeSource).toContain("body.isPublic === true");
  });
});

describe("onboarding UI visibility control", () => {
  const pageSource = fs.readFileSync(
    path.join(process.cwd(), "src/app/onboard/page.tsx"),
    "utf-8",
  );

  it("starts the visibility toggle off", () => {
    expect(pageSource).toMatch(/useState\(false\)/);
    expect(pageSource).toContain("setIsPublic");
  });

  it("sends the flag to the onboarding API", () => {
    expect(pageSource).toContain("isPublic");
  });
});
