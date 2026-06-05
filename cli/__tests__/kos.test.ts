import { describe, it, expect } from "vitest";
import {
  parsePlanFilenames,
  latestPlanFilename,
  parseChecklist,
  buildKosBranch,
} from "../kos.js";

const LIST_PLANS = `3 plan(s):

- **2026-06-03-plan-error-handling.md**: Implementation Plan: Error Handling
- **2026-06-05-plan-provider-abstraction.md**: Implementation Plan: Provider Abstraction
- **2026-06-04-plan-vault.md**: Implementation Plan: Vault`;

describe("parsePlanFilenames", () => {
  it("extracts all bolded plan filenames", () => {
    expect(parsePlanFilenames(LIST_PLANS)).toEqual([
      "2026-06-03-plan-error-handling.md",
      "2026-06-05-plan-provider-abstraction.md",
      "2026-06-04-plan-vault.md",
    ]);
  });

  it("returns empty array when there are no plans", () => {
    expect(parsePlanFilenames("No plans saved yet.")).toEqual([]);
  });
});

describe("latestPlanFilename", () => {
  it("returns the newest plan by date prefix", () => {
    expect(latestPlanFilename(LIST_PLANS)).toBe("2026-06-05-plan-provider-abstraction.md");
  });

  it("returns null when there are no plans", () => {
    expect(latestPlanFilename("No plans saved yet.")).toBeNull();
  });
});

describe("parseChecklist", () => {
  const PLAN = `# Implementation Plan: Foo

## Codebase Mapping
| File | Capture | Change | Complexity | Effort |
|------|---------|--------|------------|--------|
| a.ts | x | edit | simple | low |

## Verification Checklist
- [ ] Error messages include a handler prefix
- [ ] No regressions in the happy path
- [x] Already-done item still counts

## Notes
Not part of the checklist.`;

  it("extracts checklist items without the checkbox prefix", () => {
    expect(parseChecklist(PLAN)).toEqual([
      "Error messages include a handler prefix",
      "No regressions in the happy path",
      "Already-done item still counts",
    ]);
  });

  it("stops at the next section heading", () => {
    expect(parseChecklist(PLAN)).not.toContain("Not part of the checklist.");
  });

  it("returns empty array when there is no checklist section", () => {
    expect(parseChecklist("# Plan\n\n## Context\nNothing here.")).toEqual([]);
  });
});

describe("buildKosBranch", () => {
  it("produces a deterministic, sortable branch name from a date", () => {
    const branch = buildKosBranch(new Date("2026-06-05T10:30:45.000Z"));
    expect(branch).toBe("mnemos/kos-2026-06-05-10-30-45");
  });

  it("always starts with the mnemos/kos- prefix", () => {
    expect(buildKosBranch()).toMatch(/^mnemos\/kos-/);
  });
});
