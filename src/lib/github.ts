/**
 * GitHub API helpers.
 * Centralizes all GitHub content API interactions.
 */

const GITHUB_API = "https://api.github.com";
const GITHUB_HEADERS = { Accept: "application/vnd.github+json" };

// ── Types ──

export interface GitHubFileResponse {
  sha: string;
  content: string;
}

interface GitHubApiResult<T> {
  ok: boolean;
  data: T | null;
  status: number;
}

// ── Low-level helpers ──

function authHeaders(token: string): Record<string, string> {
  return { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };
}

export async function githubGet<T = unknown>(
  token: string,
  repo: string,
  filePath: string,
): Promise<GitHubApiResult<T>> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${filePath}?ref=main`,
    { headers: authHeaders(token) },
  );
  if (res.status === 404) return { ok: false, data: null, status: 404 };
  const data = (await res.json()) as T;
  return { ok: res.ok, data, status: res.status };
}

export async function githubPut(
  token: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  sha?: string,
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: "main",
  };
  if (sha) body["sha"] = sha;

  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub PUT ${filePath}: HTTP ${res.status} — ${errText}`);
  }
}

export async function githubDelete(
  token: string,
  repo: string,
  filePath: string,
  sha: string,
  message: string,
): Promise<void> {
  const res = await fetch(
    `${GITHUB_API}/repos/${repo}/contents/${filePath}`,
    {
      method: "DELETE",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ message, sha, branch: "main" }),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub DELETE ${filePath}: HTTP ${res.status} — ${errText}`);
  }
}

// ── High-level helpers ──

/** Read a file's decoded UTF-8 content and sha from a repo. */
export async function readFile(
  token: string,
  repo: string,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await githubGet<GitHubFileResponse>(token, repo, filePath);
  if (!res.ok || !res.data) return null;
  const decoded = Buffer.from(res.data.content.replace(/\n/g, ""), "base64").toString("utf-8");
  return { content: decoded, sha: res.data.sha };
}

/** Append a row to INDEX.md, creating it if it doesn't exist. */
export async function appendToIndex(
  token: string,
  repo: string,
  row: string,
  commitMessage: string,
): Promise<void> {
  const existing = await readFile(token, repo, "INDEX.md");

  if (existing) {
    await githubPut(token, repo, "INDEX.md", existing.content + row, commitMessage, existing.sha);
  } else {
    const header =
      "# Knowledge Hub — Master Index\n\n| Date | Resource | Keywords | Tags |\n|------|----------|----------|------|\n";
    await githubPut(token, repo, "INDEX.md", header + row, "capture: initialize index");
  }
}

/** Update or remove an entry in INDEX.md when a capture is moved or deleted. */
export async function updateIndexEntry(
  token: string,
  repo: string,
  filename: string,
  action: "apply" | "archive" | "delete",
): Promise<void> {
  const existing = await readFile(token, repo, "INDEX.md");
  if (!existing) return;

  let updated: string;
  if (action === "delete") {
    updated = existing.content
      .split("\n")
      .filter((line) => !line.includes(filename))
      .join("\n");
  } else {
    const target = action === "apply" ? "applied" : "archived";
    updated = existing.content.replace(`inbox/${filename}`, `${target}/${filename}`);
  }

  await githubPut(token, repo, "INDEX.md", updated, `${action}: update index for ${filename}`, existing.sha);
}
