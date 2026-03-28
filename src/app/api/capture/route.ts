import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

type CaptureMode = "work" | "career" | "founder" | "life";

interface ExtractedCapture {
  slug: string;
  inferredTitle: string;
  inferredAuthor: string | null;
  inferredUrl: string | null;
  inferredType: "article" | "blog" | "research" | "transcript" | "notes" | "post" | "book" | "thread" | "video";
  coreIdea: string;
  takeaways: string[];
  quotes: string[];
  modes: CaptureMode[];
  appliedTo: string | null;
  lowConfidence: boolean;
}

const SYSTEM_PROMPT_TEXT = `You are a knowledge extraction engine for a personal PKM system. Process the input and return ONLY valid JSON — no markdown, no text, no wrapping.
{"slug":"3-6-word-hyphenated-core-idea","inferredTitle":"string","inferredAuthor":"string|null","inferredUrl":"string|null","inferredType":"article|blog|research|transcript|notes|post|book|thread|video","coreIdea":"string","takeaways":["string"],"quotes":["string"],"modes":["string"],"appliedTo":"string|null","lowConfidence":false}
RULES
slug: lowercase hyphenated, derive from insight not headline, strip articles
inferredUrl: only if explicit in content, never construct
inferredType: research=citations/methodology; transcript=spoken→text; thread=social/forum chains; video=YT/video; book=excerpt/notes; notes=unstructured personal; post=LinkedIn/Substack/newsletter; blog=long-form editorial; article=journalistic. Ambiguous→format over platform.
coreIdea: 1-2 sentences. "X because Y, therefore Z." Not what the piece covers. Not "this article argues."
takeaways: 3–5 specific opinionated assertions. Must pass "so what?" test. Bad: "Consistency matters." Good: "Consistency compounds only when feedback closes within 24h."
quotes: verbatim only, only if phrasing is irreplaceable. [] if none. Never fabricate.
modes (all that apply): career=job search/interviews/professional growth; founder=startups/GTM/0-to-1/side projects; work=current role/team/tools/industry; life=habits/health/decisions/non-work
appliedTo: one sentence connecting this insight to something the reader could act on right now. null if forced or unclear.
lowConfidence: true if <100 words, URL-only, unprocessable, or coreIdea uncertain.
EDGE CASES: URL-only→extract from path+lowConfidence:true | non-English→return in same language | multiple authors→"A, B" | thread→OP as primary source
EXAMPLE
Input: "The mom test — Rob Fitzpatrick. Don't ask if your idea is good. Ask about their life. 'Would you use this?' measures politeness. Ask: 'Walk me through the last time you dealt with this.' No recent instance = not urgent enough to build."
Output: {"slug":"mom-test-past-behavior-not-validation","inferredTitle":"The Mom Test — Validating Without Leading","inferredAuthor":"Rob Fitzpatrick","inferredUrl":null,"inferredType":"book","coreIdea":"People lie about future behavior to be kind. The only reliable signal is past behavior — so questions must be about their life, not your idea.","takeaways":["'Would you use this?' measures politeness, not demand","Recency is a proxy for urgency — no recent instance means no pressing need","Interviews yield signal only when the subject doesn't know they're evaluating your idea"],"quotes":["Walk me through the last time you dealt with this."],"modes":["founder","career"],"appliedTo":"Structure discovery calls around past failures and workarounds, not hypothetical product interest.","lowConfidence":false}`;

// Max input characters to send to the LLM (~1500 tokens, covers 95% of captures)
const MAX_INPUT_CHARS = 6000;

function formatDate(): string {
  return new Date().toISOString().split("T")[0] as string;
}

function buildMarkdown(date: string, capture: ExtractedCapture, rawContent: string): string {
  const quotesSection =
    capture.quotes.length > 0
      ? capture.quotes.map((q) => `> "${q}"`).join("\n\n")
      : "_none_";

  const confidenceNote = capture.lowConfidence
    ? "\n> **Low confidence extraction** — input was short or ambiguous. Review before acting on it.\n"
    : "";

  return `---
date: ${date}
source: ${capture.inferredTitle}${capture.inferredAuthor ? ` — ${capture.inferredAuthor}` : ""}
url: ${capture.inferredUrl ?? "none"}
type: ${capture.inferredType}
modes: ${capture.modes.join(", ")}
status: inbox
---

# ${capture.inferredTitle}
${confidenceNote}
## Core idea
${capture.coreIdea}

## Key takeaways
${capture.takeaways.map((t) => `- ${t}`).join("\n")}

## Quotes
${quotesSection}

## Applied to
${capture.appliedTo ?? "_not immediately obvious_"}

## Links to memory
_none yet_

---

<details>
<summary>Raw capture</summary>

${rawContent.trim()}

</details>
`;
}

interface GithubFileResponse {
  sha: string;
  content: string;
}

async function githubGet(token: string, repo: string, filePath: string): Promise<GithubFileResponse | null> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}?ref=main`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath}: HTTP ${res.status}`);
  return res.json() as Promise<GithubFileResponse>;
}

async function githubPut(
  token: string,
  repo: string,
  filePath: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: "main",
  };
  if (sha) body["sha"] = sha;

  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub PUT ${filePath}: HTTP ${res.status} — ${errText}`);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Get authenticated user
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!user.github_repo) {
    return NextResponse.json({ error: "Knowledge repo not configured. Complete onboarding first." }, { status: 400 });
  }

  const body = (await req.json()) as { content: string; title?: string };
  const { content, title } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // Use the user's own LLM key (Anthropic for now)
  if (!user.llm_api_key) {
    return NextResponse.json({ error: "API key not configured. Complete onboarding first." }, { status: 400 });
  }

  const client = new Anthropic({ apiKey: user.llm_api_key });

  // Build user content with optional title hint, truncated for token efficiency
  const rawInput = title ? `Title hint: ${title}\n\n${content}` : content;
  const truncatedInput = rawInput.slice(0, MAX_INPUT_CHARS);

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT_TEXT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: truncatedInput }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
  const rawJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  const capture = JSON.parse(rawJson) as ExtractedCapture;

  const date = formatDate();
  const filename = `${date}-${capture.slug}.md`;
  const markdown = buildMarkdown(date, capture, content);

  // Write to the USER's GitHub repo using THEIR token
  await githubPut(user.github_token, user.github_repo, `inbox/${filename}`, markdown, `capture: add ${filename}`);

  // Update INDEX.md
  const row = `| ${date} | [${capture.slug}](inbox/${filename}) | ${capture.coreIdea.slice(0, 80)}... | ${capture.modes.join(", ")} |\n`;

  const existing = await githubGet(user.github_token, user.github_repo, "INDEX.md");
  if (existing) {
    const current = Buffer.from(existing.content.replace(/\n/g, ""), "base64").toString("utf-8");
    await githubPut(
      user.github_token,
      user.github_repo,
      "INDEX.md",
      current + row,
      `capture: update index for ${filename}`,
      existing.sha
    );
  } else {
    const header = `# Knowledge Hub — Master Index\n\n| Date | Resource | Keywords | Modes |\n|------|----------|----------|-------|\n`;
    await githubPut(user.github_token, user.github_repo, "INDEX.md", header + row, "capture: initialize index");
  }

  return NextResponse.json({ capture, filename });
}
