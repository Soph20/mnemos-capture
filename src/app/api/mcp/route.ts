import { NextRequest, NextResponse } from "next/server";
import { getUserByApiKey } from "@/lib/db";
import type { User } from "@/lib/db";
import { githubGet, githubPut, readFile } from "@/lib/github";
import { extractCapture, formatDate, buildIndexRow } from "@/lib/llm";
import type { ExtractedCapture } from "@/lib/types";

// ── Types ──

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

// ── Tool definitions ──

const TOOLS = [
  {
    name: "capture",
    description:
      "Capture a resource (article, thread, notes, transcript) into the knowledge hub. Extracts insights, tags them, and commits to the knowledge repo.",
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
        tag: { type: "string", description: "Filter by tag (e.g. 'ai-agents', 'pricing')" },
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

async function handleCapture(user: User, args: { content: string; title?: string }): Promise<string> {
  if (!user.llm_api_key) throw new Error("API key not configured. Complete onboarding at mnemos-capture.vercel.app");
  if (!user.github_repo) throw new Error("Knowledge repo not configured");

  const capture: ExtractedCapture = await extractCapture(user.llm_api_key, args.content, args.title);

  const date = formatDate();
  const filename = `${date}-${capture.slug}.md`;

  // Build compact Markdown for MCP (no raw capture section)
  const markdown = [
    `---`,
    `date: ${date}`,
    `source: ${capture.inferredTitle}`,
    `type: ${capture.inferredType}`,
    `tags: ${capture.tags.join(", ")}`,
    `status: inbox`,
    `---`,
    ``,
    `# ${capture.inferredTitle}`,
    ``,
    `## Core idea`,
    capture.coreIdea,
    ``,
    `## Key takeaways`,
    ...capture.takeaways.map((t) => `- ${t}`),
    ``,
    `## Quotes`,
    capture.quotes.length > 0
      ? capture.quotes.map((q) => `> "${q}"`).join("\n\n")
      : "_none_",
    ``,
  ].join("\n");

  await githubPut(user.github_token, user.github_repo, `inbox/${filename}`, markdown, `capture: add ${filename}`);

  // Update INDEX.md
  const row = buildIndexRow(date, capture, filename);
  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (existing) {
    await githubPut(user.github_token, user.github_repo, "INDEX.md", existing.content + row, "capture: update index", existing.sha);
  }

  return `Captured: ${capture.inferredTitle}\nFile: inbox/${filename}\nTags: ${capture.tags.join(", ")}`;
}

async function handleListInbox(user: User): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const res = await githubGet<Array<{ name: string }>>(user.github_token, user.github_repo, "inbox");
  if (!res.ok || !res.data) return "Inbox is empty.";
  const mdFiles = res.data.filter((f) => f.name.endsWith(".md"));
  if (mdFiles.length === 0) return "Inbox is empty.";
  return `${mdFiles.length} capture(s):\n${mdFiles.map((f) => `- ${f.name}`).join("\n")}`;
}

async function handleSearch(user: User, args: { query: string; tag?: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (!existing) return "No captures yet.";

  const lines = existing.content
    .split("\n")
    .filter((l) => l.startsWith("|") && !l.startsWith("| Date") && !l.startsWith("|---"));

  const q = args.query.toLowerCase();
  const matches = lines.filter((l) => {
    const lower = l.toLowerCase();
    return lower.includes(q) && (args.tag ? lower.includes(args.tag) : true);
  });

  if (matches.length === 0) return `No matches for "${args.query}".`;
  return `${matches.length} match(es):\n${matches.join("\n")}`;
}

// ── MCP HTTP handler ──

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authHeader = req.headers.get("authorization");
  const apiKey = authHeader?.replace("Bearer ", "");

  if (!apiKey) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Missing API key" } },
      { status: 401 },
    );
  }

  const user = await getUserByApiKey(apiKey);
  if (!user) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32600, message: "Invalid API key" } },
      { status: 401 },
    );
  }

  const body = (await req.json()) as JsonRpcRequest;
  const { method, id, params } = body;

  try {
    switch (method) {
      case "initialize":
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
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
            result = await handleSearch(user, toolArgs as { query: string; tag?: string });
            break;
          default:
            return NextResponse.json({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: `Unknown tool: ${toolName}` },
            });
        }

        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          result: { content: [{ type: "text", text: result }] },
        });
      }

      default:
        return NextResponse.json({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: `Unknown method: ${method}` },
        });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      result: { content: [{ type: "text", text: `Error: ${message}` }], isError: true },
    });
  }
}
