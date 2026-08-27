import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

/**
 * CLAUDE.md, Trigger #3: an unguarded `req.json()` throw escapes the handler,
 * Next.js answers with its HTML error page, and the client's `res.json()` then
 * fails with Safari's "The string did not match the expected pattern."
 *
 * The rule was documented but not uniformly followed, so this enforces it.
 * Two legitimate shapes count as guarded:
 *   1. the call sits inside a try block, or
 *   2. it sits in a helper whose every call site is inside a try
 *      (oauth/token parses the body in `readParams` and guards the caller).
 */
const routes = execSync("git ls-files 'src/app/api/**/route.ts'", { encoding: "utf-8" })
  .split("\n")
  .filter(Boolean);

/** Blank out comments so prose mentioning req.json() isn't mistaken for code. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** True when `index` falls inside an open try block. */
function insideTry(src: string, index: number): boolean {
  const before = src.slice(0, index);
  const lastTry = before.lastIndexOf("try {");
  if (lastTry === -1) return false;
  return !before.slice(lastTry).includes("catch");
}

/** Name of the function enclosing `index`, if it is a named declaration. */
function enclosingFunction(src: string, index: number): string | null {
  const before = src.slice(0, index);
  const matches = [...before.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)];
  return matches.length ? matches[matches.length - 1]![1]! : null;
}

/** True when every call to `name` in the file sits inside a try block. */
function everyCallGuarded(src: string, name: string): boolean {
  const calls = [...src.matchAll(new RegExp(`\\b${name}\\s*\\(`, "g"))].filter(
    (m) => !/function\s+$/.test(src.slice(Math.max(0, m.index! - 20), m.index!)),
  );
  return calls.length > 0 && calls.every((m) => insideTry(src, m.index!));
}

describe("API routes always return JSON", () => {
  it("finds route files to check", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  for (const route of routes) {
    const src = stripComments(fs.readFileSync(path.join(process.cwd(), route), "utf-8"));
    let from = 0;
    let n = 0;
    for (;;) {
      const idx = src.indexOf("req.json()", from);
      if (idx === -1) break;
      from = idx + 1;
      n += 1;
      const label = `${route.replace("src/app/api/", "")}${n > 1 ? ` (#${n})` : ""}`;

      it(`guards req.json() in ${label}`, () => {
        if (insideTry(src, idx)) return; // shape 1
        const fn = enclosingFunction(src, idx);
        expect(
          fn ? everyCallGuarded(src, fn) : false,
          `unguarded req.json() — a malformed body would return HTML, not JSON`,
        ).toBe(true); // shape 2
      });
    }
  }
});
