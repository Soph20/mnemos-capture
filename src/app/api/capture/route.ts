import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { githubPut, appendToIndex, readFile } from "@/lib/github";
import { extractCapture, formatDate, buildMarkdown, buildIndexRow } from "@/lib/llm";
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

  const body = (await req.json()) as { content: string; title?: string };
  const { content, title } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Extract insights via LLM
  let capture;
  try {
    capture = await extractCapture(user.llm_api_key, content, title);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // Build Markdown and commit to user's repo
  const date = formatDate();
  const filename = `${date}-${capture.slug}.md`;
  const markdown = buildMarkdown(date, capture, content);

  await githubPut(
    user.github_token,
    user.github_repo,
    `inbox/${filename}`,
    markdown,
    `capture: add ${filename}`,
  );

  // Update INDEX.md
  const row = buildIndexRow(date, capture, filename);
  await appendToIndex(user.github_token, user.github_repo, row, `capture: update index for ${filename}`);

  // Auto-link to related captures (best-effort)
  if (user.llm_api_key) {
    try {
      const indexFile = await readFile(user.github_token, user.github_repo, "INDEX.md");
      if (indexFile) {
        await linkCapture(user.llm_api_key, user.github_token, user.github_repo, capture, filename, "inbox", indexFile.content);
      }
    } catch {
      // Linking is best-effort
    }
  }

  return NextResponse.json({ capture, filename });
}
