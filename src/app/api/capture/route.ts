import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { githubPut, appendToIndex, readFile } from "@/lib/github";
import { extractCapture, formatDate, buildMarkdown, buildIndexRow, detectSourceType } from "@/lib/llm";
import { fetchSourceContent } from "@/lib/fetch-source";
import { linkCapture } from "@/lib/linking";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!user.github_repo) {
    return NextResponse.json(
      { error: "Knowledge repo not configured. Complete onboarding first." },
      { status: 400 },
    );
  }

  if (!user.llm_api_key) {
    return NextResponse.json(
      { error: "API key not configured. Complete onboarding first." },
      { status: 400 },
    );
  }

  // Parse the body in its own try/catch: an unguarded req.json() throw escapes
  // the handler, Next.js answers with its HTML error page, and the client's
  // res.json() then fails with Safari's "The string did not match the expected
  // pattern." — the exact failure documented in CLAUDE.md. API routes must
  // always return JSON.
  let body: { content?: unknown; title?: unknown };
  try {
    body = (await req.json()) as { content?: unknown; title?: unknown };
  } catch {
    return NextResponse.json({ error: "[capture] Body must be JSON." }, { status: 400 });
  }

  const content = typeof body.content === "string" ? body.content : "";
  const title = typeof body.title === "string" ? body.title : undefined;

  if (!content.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  const sourceType = detectSourceType(content);

  // For a bare URL, fetch the live page server-side so the LLM reasons over the
  // page's real content instead of guessing from training data (which risks
  // fabricated insights or a timeout-driven "Load failed"). Best-effort: on any
  // failure we fall back to URL-only mode and pass the raw URL string through.
  let llmContent = content;
  if (sourceType === "url") {
    const fetched = await fetchSourceContent(content.trim());
    if (fetched) {
      llmContent = `Source URL: ${content.trim()}\n\n${fetched}`;
    }
  }

  // Extract insights via LLM
  let capture;
  try {
    capture = await extractCapture(user.llm_api_key, llmContent, title, user.llm_provider);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Build Markdown and commit to user's repo
  const date = formatDate();
  const filename = `${date}-${capture.slug}.md`;
  const markdown = buildMarkdown(date, capture, content, sourceType);

  await githubPut(
    user.github_token,
    user.github_repo,
    `inbox/${filename}`,
    markdown,
    `capture: add ${filename}`,
  );

  // Update INDEX.md
  const row = buildIndexRow(date, capture, filename, sourceType);
  await appendToIndex(user.github_token, user.github_repo, row, `capture: update index for ${filename}`);

  // Auto-link to related captures (best-effort)
  if (user.llm_api_key) {
    try {
      const indexFile = await readFile(user.github_token, user.github_repo, "INDEX.md");
      if (indexFile) {
        await linkCapture(user.llm_api_key, user.github_token, user.github_repo, capture, filename, "inbox", indexFile.content, user.llm_provider);
      }
    } catch {
      // Linking is best-effort
    }
  }

  return NextResponse.json({ capture, filename });
}
