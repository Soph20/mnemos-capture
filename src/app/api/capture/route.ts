import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? ""; // e.g., "spv/meridian-knowledge"
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";

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
  content: string; // base64 encoded with embedded newlines
}

async function githubGet(filePath: string): Promise<GithubFileResponse | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
    }
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath}: HTTP ${res.status}`);
  return res.json() as Promise<GithubFileResponse>;
}

async function githubPut(
  filePath: string,
  content: string,
  message: string,
  sha?: string
): Promise<void> {
  const body: Record<string, string> = {
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch: GITHUB_BRANCH,
  };
  if (sha) body["sha"] = sha;

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${filePath}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
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

async function writeCapture(filename: string, markdown: string): Promise<void> {
  await githubPut(`inbox/${filename}`, markdown, `capture: add ${filename}`);
}

async function appendToIndex(
  date: string,
  capture: ExtractedCapture,
  filename: string
): Promise<void> {
  const row = `| ${date} | [${capture.slug}](inbox/${filename}) | ${capture.coreIdea.slice(0, 80)}... | ${capture.modes.join(", ")} |\n`;

  const existing = await githubGet("INDEX.md");

  if (existing) {
    const current = Buffer.from(existing.content.replace(/\n/g, ""), "base64").toString("utf-8");
    await githubPut(
      "INDEX.md",
      current + row,
      `capture: update index for ${filename}`,
      existing.sha
    );
  } else {
    const header = `# Knowledge Hub — Master Index\n\n> Search by topic, mode, date, or keyword.\n> Full records in \`inbox/\` (unprocessed) or \`[mode]/\` (processed).\n\n| Date | Resource | Keywords | Modes |\n|------|----------|----------|-------|\n`;
    await githubPut("INDEX.md", header + row, "capture: initialize index");
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO not configured" },
      { status: 500 }
    );
  }

  let body: { content: string; title?: string };
  try {
    body = await req.json() as { content: string; title?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const { content, title } = body;

  if (!content?.trim()) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  // If content is a bare URL, fetch and extract the page text server-side
  let processedContent = content.trim();
  if (/^https?:\/\/\S+$/.test(processedContent)) {
    try {
      const pageRes = await fetch(processedContent, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Mnemos/1.0)" },
        signal: AbortSignal.timeout(8000),
      });
      if (pageRes.ok) {
        const html = await pageRes.text();
        const text = html
          .replace(/<(script|style|nav|header|footer)[^>]*>[\s\S]*?<\/\1>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 15000);
        if (text.length > 200) {
          processedContent = `Source URL: ${content.trim()}\n\n${text}`;
        }
      }
    } catch {
      // Failed to fetch URL; proceed with the URL string as content
    }
  }

  const userContent = title ? `Title hint: ${title}\n\n${processedContent}` : processedContent;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userContent }],
    });

    const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
    const rawJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

    let capture: ExtractedCapture;
    try {
      capture = JSON.parse(rawJson) as ExtractedCapture;
    } catch {
      return NextResponse.json(
        { error: "Failed to parse AI response. Please try again." },
        { status: 500 }
      );
    }

    const date = formatDate();
    const safeSlug = (capture.slug ?? "untitled")
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "untitled";
    const filename = `${date}-${safeSlug}.md`;
    const markdown = buildMarkdown(date, capture, content);

    await writeCapture(filename, markdown);
    await appendToIndex(date, capture, filename);

    return NextResponse.json({ capture, filename });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
