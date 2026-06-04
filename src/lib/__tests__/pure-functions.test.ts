import { describe, it, expect } from "vitest";
import {
  detectSourceType,
  formatDate,
  buildMarkdown,
  buildIndexRow,
  curateSingle,
} from "../llm";
import type { ExtractedCapture } from "../types";

// ── detectSourceType ──────────────────────────────────────────────────────────

describe("detectSourceType", () => {
  it("returns 'url' for a bare http URL", () => {
    expect(detectSourceType("https://example.com")).toBe("url");
  });

  it("returns 'url' for a bare http URL with path", () => {
    expect(detectSourceType("https://example.com/article?ref=1")).toBe("url");
  });

  it("returns 'url' even with surrounding whitespace", () => {
    expect(detectSourceType("  https://example.com  ")).toBe("url");
  });

  it("returns 'url' for http:// (not just https://)", () => {
    expect(detectSourceType("http://blog.example.com/post-123")).toBe("url");
  });

  it("returns 'note' for short free-form text under 500 chars", () => {
    expect(detectSourceType("This is a short note")).toBe("note");
  });

  it("returns 'note' for exactly 499 chars", () => {
    expect(detectSourceType("a".repeat(499))).toBe("note");
  });

  it("returns 'paste' for exactly 500 chars", () => {
    expect(detectSourceType("a".repeat(500))).toBe("paste");
  });

  it("returns 'paste' for long article text", () => {
    const longText = "This is a long article. ".repeat(50);
    expect(detectSourceType(longText)).toBe("paste");
  });

  it("does not classify multi-word content as 'url' even if it contains a URL", () => {
    expect(detectSourceType("Check out https://example.com for more info")).toBe("note");
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe("formatDate", () => {
  it("returns a string matching YYYY-MM-DD format", () => {
    const result = formatDate();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns today's date", () => {
    const today = new Date().toISOString().split("T")[0];
    expect(formatDate()).toBe(today);
  });
});

// ── buildMarkdown ─────────────────────────────────────────────────────────────

const baseCapture: ExtractedCapture = {
  slug: "test-slug",
  inferredTitle: "Test Title",
  inferredAuthor: "Test Author",
  inferredUrl: "https://example.com",
  inferredType: "article",
  coreIdea: "Core idea here.",
  takeaways: ["First takeaway", "Second takeaway"],
  quotes: ["Great quote here."],
  tags: ["testing", "examples"],
  appliedTo: "Apply in tests.",
  lowConfidence: false,
};

describe("buildMarkdown", () => {
  it("includes source_type in frontmatter when provided", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw content", "url");
    expect(md).toContain("source_type: url");
  });

  it("defaults source_type to 'paste' when not provided", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw content");
    expect(md).toContain("source_type: paste");
  });

  it("uses 'note' source_type correctly", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw content", "note");
    expect(md).toContain("source_type: note");
  });

  it("includes required frontmatter fields", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw");
    expect(md).toContain("date: 2026-06-04");
    expect(md).toContain("type: article");
    expect(md).toContain("tags: testing, examples");
    expect(md).toContain("status: inbox");
    expect(md).toContain("url: https://example.com");
  });

  it("includes author in source field when present", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw");
    expect(md).toContain("source: Test Title — Test Author");
  });

  it("omits author dash when author is null", () => {
    const capture = { ...baseCapture, inferredAuthor: null };
    const md = buildMarkdown("2026-06-04", capture, "raw");
    expect(md).toContain("source: Test Title");
    expect(md).not.toContain(" — null");
  });

  it("uses 'none' for url when inferredUrl is null", () => {
    const capture = { ...baseCapture, inferredUrl: null };
    const md = buildMarkdown("2026-06-04", capture, "raw");
    expect(md).toContain("url: none");
  });

  it("includes low-confidence warning when lowConfidence is true", () => {
    const capture = { ...baseCapture, lowConfidence: true };
    const md = buildMarkdown("2026-06-04", capture, "raw");
    expect(md).toContain("Low confidence extraction");
  });

  it("omits low-confidence warning when lowConfidence is false", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw");
    expect(md).not.toContain("Low confidence extraction");
  });

  it("formats quotes with blockquote syntax", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw");
    expect(md).toContain('> "Great quote here."');
  });

  it("writes '_none_' when quotes array is empty", () => {
    const capture = { ...baseCapture, quotes: [] };
    const md = buildMarkdown("2026-06-04", capture, "raw");
    expect(md).toContain("_none_");
  });

  it("includes all takeaways as list items", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw");
    expect(md).toContain("- First takeaway");
    expect(md).toContain("- Second takeaway");
  });

  it("wraps raw content in a details block", () => {
    const md = buildMarkdown("2026-06-04", baseCapture, "raw content here");
    expect(md).toContain("<details>");
    expect(md).toContain("raw content here");
    expect(md).toContain("</details>");
  });
});

// ── buildIndexRow ─────────────────────────────────────────────────────────────

describe("buildIndexRow", () => {
  it("returns a Markdown table row", () => {
    const row = buildIndexRow("2026-06-04", baseCapture, "2026-06-04-test-slug.md");
    expect(row).toMatch(/^\|.+\|.+\|.+\|.+\|/);
  });

  it("includes the date", () => {
    const row = buildIndexRow("2026-06-04", baseCapture, "2026-06-04-test-slug.md");
    expect(row).toContain("2026-06-04");
  });

  it("includes a link to the inbox file", () => {
    const row = buildIndexRow("2026-06-04", baseCapture, "2026-06-04-test-slug.md");
    expect(row).toContain("inbox/2026-06-04-test-slug.md");
    expect(row).toContain("test-slug");
  });

  it("includes the tags", () => {
    const row = buildIndexRow("2026-06-04", baseCapture, "2026-06-04-test-slug.md");
    expect(row).toContain("testing, examples");
  });

  it("truncates coreIdea to 80 chars", () => {
    const longCapture = { ...baseCapture, coreIdea: "A".repeat(100) };
    const row = buildIndexRow("2026-06-04", longCapture, "2026-06-04-test-slug.md");
    // The row should contain the truncated (80 char) version with ellipsis
    expect(row).toContain("A".repeat(80));
  });
});

// ── curateSingle ─────────────────────────────────────────────────────────────

describe("curateSingle", () => {
  it("returns 'ok' for HTTP 200 with no low-confidence flag", () => {
    const result = curateSingle(200, false);
    expect(result.status).toBe("ok");
  });

  it("returns 'ok' when URL status is null (network error) and not low-confidence", () => {
    const result = curateSingle(null, false);
    expect(result.status).toBe("ok");
  });

  it("returns 'stale' for HTTP 404", () => {
    const result = curateSingle(404, false);
    expect(result.status).toBe("stale");
    expect(result.reason).toContain("404");
  });

  it("returns 'stale' for HTTP 410 (Gone)", () => {
    const result = curateSingle(410, false);
    expect(result.status).toBe("stale");
    expect(result.reason).toContain("410");
  });

  it("returns 'low_confidence' for HTTP 200 with low-confidence flag", () => {
    const result = curateSingle(200, true);
    expect(result.status).toBe("low_confidence");
  });

  it("returns 'low_confidence' when URL is null and low-confidence flag is set", () => {
    const result = curateSingle(null, true);
    expect(result.status).toBe("low_confidence");
  });

  it("returns 'stale_and_low_confidence' when both stale and low-confidence", () => {
    const result = curateSingle(404, true);
    expect(result.status).toBe("stale_and_low_confidence");
    expect(result.reason).toContain("404");
  });

  it("does not flag HTTP 301 or 302 as stale (redirects are ok)", () => {
    expect(curateSingle(301, false).status).toBe("ok");
    expect(curateSingle(302, false).status).toBe("ok");
  });

  it("includes a non-empty reason string for every status", () => {
    for (const [status, lc] of [[200, false], [404, false], [200, true], [404, true], [null, true]] as [number | null, boolean][]) {
      expect(curateSingle(status, lc).reason.length).toBeGreaterThan(0);
    }
  });
});
