import { describe, it, expect } from "vitest";
import { encodeRepoPath } from "../github";
import { validateFetchUrl } from "../fetch-source";

describe("encodeRepoPath", () => {
  it("passes through an ordinary capture filename", () => {
    expect(encodeRepoPath("inbox/2026-05-14-some-slug.md")).toBe("inbox/2026-05-14-some-slug.md");
  });

  it("rejects parent-directory traversal", () => {
    // Unencoded, this walked out of /contents/ to another api.github.com
    // endpoint carrying the user's token.
    expect(() => encodeRepoPath("../../../../user/repos")).toThrow(/traversal/);
    expect(() => encodeRepoPath("inbox/../../../user")).toThrow(/traversal/);
  });

  it("rejects a single-dot segment", () => {
    expect(() => encodeRepoPath("inbox/./x.md")).toThrow(/traversal/);
  });

  it("rejects an empty path", () => {
    expect(() => encodeRepoPath("")).toThrow(/empty/);
    expect(() => encodeRepoPath("/")).toThrow();
  });

  it("rejects backslashes", () => {
    expect(() => encodeRepoPath("inbox\\..\\x.md")).toThrow(/backslash/);
  });

  it("encodes characters that would rewrite the query or truncate the path", () => {
    expect(encodeRepoPath("inbox/a?ref=other.md")).toBe("inbox/a%3Fref%3Dother.md");
    expect(encodeRepoPath("inbox/a#b.md")).toBe("inbox/a%23b.md");
  });

  it("keeps the resulting URL inside the contents endpoint", () => {
    const url = new URL(
      `https://api.github.com/repos/o/r/contents/${encodeRepoPath("inbox/a?x=1.md")}?ref=main`,
    );
    expect(url.pathname.startsWith("/repos/o/r/contents/")).toBe(true);
    expect(url.searchParams.get("ref")).toBe("main");
  });

  it("encodes spaces and unicode rather than rejecting them", () => {
    expect(encodeRepoPath("inbox/my note.md")).toBe("inbox/my%20note.md");
  });
});

describe("validateFetchUrl", () => {
  it("accepts an ordinary public https URL", () => {
    expect(validateFetchUrl("https://example.com/post")).not.toBeNull();
  });

  it("rejects non-http protocols", () => {
    expect(validateFetchUrl("file:///etc/passwd")).toBeNull();
    expect(validateFetchUrl("ftp://example.com/x")).toBeNull();
  });

  it("rejects internal hosts, including the cloud metadata endpoint", () => {
    expect(validateFetchUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(validateFetchUrl("http://localhost:3000/internal")).toBeNull();
    expect(validateFetchUrl("http://10.0.0.5/")).toBeNull();
  });

  it("rejects a malformed URL", () => {
    expect(validateFetchUrl("not a url")).toBeNull();
  });
});
