import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";

type CaptureMode = "work" | "career" | "founder" | "life";

interface ExtractedCapture {
  slug: string;
  inferredTitle: string;
  inferredAuthor: string | null;
  inferredUrl: string | null;
  inferredType: "article" | "blog" | "research" | "transcript" | "notes" | "post" | "book";
  coreIdea: string;
  takeaways: string[];
  quotes: string[];
  modes: CaptureMode[];
  appliedTo: string | null;
}

const SYSTEM_PROMPT = `You are processing a captured resource for a personal knowledge hub. Extract the following from the content provided and return ONLY valid JSON — no markdown, no explanation, just the JSON object.

{
  "slug": "short-lowercase-hyphenated-title-max-6-words",
  "inferredTitle": "Human readable title",
  "inferredAuthor": "Author name or null",
  "inferredUrl": "URL if present in content or null",
  "inferredType": "article|blog|research|transcript|notes|post|book",
  "coreIdea": "1-2 sentences. The actual insight, not a summary. Not 'this article discusses X.' More like 'X is true because Y, which means Z.'",
  "takeaways": ["specific opinionated takeaway — not a restatement", "another takeaway"],
  "quotes": ["verbatim quote worth keeping — only if genuinely quotable"],
  "modes": ["career", "founder", "work", "life"],
  "appliedTo": "one sentence connecting to something actionable, or null"
}

Mode routing rules — include all that apply:
- PM craft, product frameworks, interviews, job search, career narrative, company research → "career"
- Promix, AI-native products, startup, B2B ops, digital agencies, founder thinking, 0-to-1 → "founder"
- Well-being, habits, books (non-work), life decisions, mental health, energy, ADHD → "life"
- Telecom, B2B SaaS, campaigns, routing API, messaging platforms, work stakeholders → "work"

Rules:
- takeaways: 3–5 max, specific and opinionated, not restatements of the headline
- quotes: only verbatim, skip if nothing is genuinely quotable
- When in doubt on modes, tag broadly rather than narrowly
- coreIdea must be the actual insight, not a description of what the resource covers`;

function formatDate(): string {
  return new Date().toISOString().split("T")[0] as string;
}

function buildMarkdown(date: string, capture: ExtractedCapture, rawContent: string): string {
  const quotesSection =
    capture.quotes.length > 0
      ? capture.quotes.map((q) => `> "${q}"`).join("\n\n")
      : "_none_";

  return `---
date: ${date}
source: ${capture.inferredTitle}${capture.inferredAuthor ? ` — ${capture.inferredAuthor}` : ""}
url: ${capture.inferredUrl ?? "none"}
type: ${capture.inferredType}
modes: ${capture.modes.join(", ")}
status: inbox
---

# ${capture.inferredTitle}

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
  const userContent = title ? `Title hint: ${title}\n\n${content}` : content;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
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
