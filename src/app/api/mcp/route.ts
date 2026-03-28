import { NextRequest, NextResponse } from "next/server";
import { getUserByApiKey } from "@/lib/db";
import type { User } from "@/lib/db";
import Anthropic from "@anthropic-ai/sdk";

// ── Types ──

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// ── GitHub helpers ──

async function githubGet(token: string, repo: string, path: string): Promise<{ ok: boolean; data: unknown }> {
  const res = await fetch(
    `https://api.github.com/repos/${repo}/contents/${path}?ref=main`,
    { headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" } }
  );
  if (res.status === 404) return { ok: false, data: null };
  const data: unknown = await res.json();
  return { ok: res.ok, data };
}

async function githubPut(token: string, repo: string, filePath: string, content: string, message: string, sha?: string): Promise<void> {
  const body: Record<string, string> = { message, content: Buffer.from(content, "utf-8").toString("base64"), branch: "main" };
  if (sha) body["sha"] = sha;
  const res = await fetch(`https://api.github.com/repos/${repo}/contents/${filePath}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`GitHub PUT ${filePath}: HTTP ${res.status}`);
}

// ── Tool definitions ──

const TOOLS = [
  {
    name: "capture",
    description: "Capture a resource (article, thread, notes, transcript) into the knowledge hub. Claude extracts insights, tags them, and commits to the knowledge repo.",
    inputSchema: {
      type: "object" as const,
      properties: {
        content: { type: "string", description: "The content to capture" },
        title: { type: "string", description: "Optional title hint" },
      },
      required: ["content"],
    },
  },
  {
    name: "search_captures",
    description: "Search the knowledge hub for captures matching a query.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search term" },
        mode: { type: "string", enum: ["career", "work", "founder", "life"], description: "Filter by mode" },
      },
      required: ["query"],
    },
  },
  {
    name: "list_inbox",
    description: "List all unprocessed captures in the inbox.",
    inputSchema: { type: "object" as const, properties: {} },
  },
];

// ── Tool handlers ──

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
EDGE CASES: URL-only→extract from path+lowConfidence:true | non-English→return in same language | multiple authors→"A, B" | thread→OP as primary source`;

const MAX_INPUT_CHARS = 6000;

async function handleCapture(user: User, args: { content: string; title?: string }): Promise<string> {
  if (!user.llm_api_key) throw new Error("API key not configured. Complete onboarding at mnemos-capture.vercel.app");
  if (!user.github_repo) throw new Error("Knowledge repo not configured");

  const client = new Anthropic({ apiKey: user.llm_api_key });
  const rawInput = args.title ? `Title hint: ${args.title}\n\n${args.content}` : args.content;
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
  const capture = JSON.parse(rawJson) as Record<string, unknown>;

  const date = new Date().toISOString().split("T")[0] as string;
  const slug = capture["slug"] as string;
  const filename = `${date}-${slug}.md`;
  const modes = capture["modes"] as string[];
  const takeaways = capture["takeaways"] as string[];
  const quotes = capture["quotes"] as string[];
  const coreIdea = capture["coreIdea"] as string;

  const markdown = `---\ndate: ${date}\nsource: ${capture["inferredTitle"]}\ntype: ${capture["inferredType"]}\nmodes: ${modes.join(", ")}\nstatus: inbox\n---\n\n# ${capture["inferredTitle"]}\n\n## Core idea\n${coreIdea}\n\n## Key takeaways\n${takeaways.map((t) => `- ${t}`).join("\n")}\n\n## Quotes\n${quotes.length > 0 ? quotes.map((q) => `> "${q}"`).join("\n\n") : "_none_"}\n`;

  await githubPut(user.github_token, user.github_repo, `inbox/${filename}`, markdown, `capture: add ${filename}`);

  // Update INDEX.md
  const row = `| ${date} | [${slug}](inbox/${filename}) | ${coreIdea.slice(0, 80)}... | ${modes.join(", ")} |\n`;
  const existing = await githubGet(user.github_token, user.github_repo, "INDEX.md");
  if (existing.ok) {
    const fileData = existing.data as { sha: string; content: string };
    const current = Buffer.from(fileData.content.replace(/\n/g, ""), "base64").toString("utf-8");
    await githubPut(user.github_token, user.github_repo, "INDEX.md", current + row, `capture: update index`, fileData.sha);
  }

  return `Captured: ${capture["inferredTitle"]}\nFile: inbox/${filename}\nModes: ${modes.join(", ")}`;
}

async function handleListInbox(user: User): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const res = await githubGet(user.github_token, user.github_repo, "inbox");
  if (!res.ok) return "Inbox is empty.";
  const files = res.data as Array<{ name: string }>;
  const mdFiles = files.filter((f) => f.name.endsWith(".md"));
  if (mdFiles.length === 0) return "Inbox is empty.";
  return `${mdFiles.length} capture(s):\n${mdFiles.map((f) => `- ${f.name}`).join("\n")}`;
}

async function handleSearch(user: User, args: { query: string; mode?: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const res = await githubGet(user.github_token, user.github_repo, "INDEX.md");
  if (!res.ok) return "No captures yet.";
  const fileData = res.data as { content: string };
  const content = Buffer.from(fileData.content.replace(/\n/g, ""), "base64").toString("utf-8");
  const lines = content.split("\n").filter((l) => l.startsWith("|") && !l.startsWith("| Date") && !l.startsWith("|---"));
  const q = args.query.toLowerCase();
  const matches = lines.filter((l) => {
    const lower = l.toLowerCase();
    return lower.includes(q) && (args.mode ? lower.includes(args.mode) : true);
  });
  if (matches.length === 0) return `No matches for "${args.query}".`;
  return `${matches.length} match(es):\n${matches.join("\n")}`;
}

// ── MCP HTTP handler ──

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth via Bearer token (API key)
  const authHeader = req.headers.get("authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  if (!apiKey) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message: "Missing API key" } }, { status: 401 });
  }

  const user = await getUserByApiKey(apiKey);
  if (!user) {
    return NextResponse.json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid API key" } }, { status: 401 });
  }

  const body = (await req.json()) as JsonRpcRequest;
  const { method, id, params } = body;

  try {
    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "mnemos", version: "1.0.0" },
          },
        });

      case "tools/list":
        return NextResponse.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });

      case "tools/call": {
        const toolName = (params as { name: string }).name;
        const toolArgs = (params as { arguments?: Record<string, unknown> }).arguments ?? {};

        let result: string;
        switch (toolName) {
          case "capture":
            result = await handleCapture(user, toolArgs as { content: string; title?: string });
            break;
          case "list_inbox":
            result = await handleListInbox(user);
            break;
          case "search_captures":
            result = await handleSearch(user, toolArgs as { query: string; mode?: string });
            break;
          default:
            return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown tool: ${toolName}` } });
        }

        return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: result }] } });
      }

      default:
        return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Error: ${message}` }], isError: true } });
  }
}
