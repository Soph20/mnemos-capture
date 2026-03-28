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

async function handleCapture(user: User, args: { content: string; title?: string }): Promise<string> {
  if (!user.llm_api_key) throw new Error("API key not configured. Complete onboarding at mnemos-capture.vercel.app");
  if (!user.github_repo) throw new Error("Knowledge repo not configured");

  const client = new Anthropic({ apiKey: user.llm_api_key });
  const userContent = args.title ? `Title hint: ${args.title}\n\n${args.content}` : args.content;

  const SYSTEM_PROMPT = `You are processing a captured resource for a personal knowledge hub. Extract the following and return ONLY valid JSON:
{"slug":"short-hyphenated","inferredTitle":"Title","inferredAuthor":null,"inferredUrl":null,"inferredType":"article","coreIdea":"The insight","takeaways":["takeaway"],"quotes":[],"modes":["career"],"appliedTo":null}`;

  const message = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
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
