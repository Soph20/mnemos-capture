import { NextRequest, NextResponse } from "next/server";
import { getUserByApiKey } from "@/lib/db";
import type { User } from "@/lib/db";
import { githubGet, githubPut, githubDelete, readFile, updateIndexEntry } from "@/lib/github";
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
    description: "List unprocessed captures in the inbox with summaries (title, type, tags, core idea).",
    inputSchema: { type: "object" as const, properties: {} },
  },
  {
    name: "read_capture",
    description: "Read the full content of a capture from the knowledge repo. Defaults to inbox/ if no path prefix given.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Filename (e.g. '2026-04-02-some-slug.md') or full path (e.g. 'applied/2026-04-02-some-slug.md')" },
      },
      required: ["filename"],
    },
  },
  {
    name: "apply_capture",
    description: "Mark a capture as applied. Moves from inbox/ to applied/, updates status and index. The agent should apply the insight to the target (CLAUDE.md, project file, etc.) separately — this tool handles bookkeeping.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Filename in inbox (e.g. '2026-04-02-some-slug.md')" },
        applied_note: { type: "string", description: "Brief note on how/where the capture was applied (e.g. 'Added as CLAUDE.md rule for error handling')" },
      },
      required: ["filename"],
    },
  },
  {
    name: "archive_capture",
    description: "Archive a capture — reviewed but not actionable now. Moves from inbox/ to archived/ and updates the index.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Filename in inbox (e.g. '2026-04-02-some-slug.md')" },
      },
      required: ["filename"],
    },
  },
  {
    name: "delete_capture",
    description: "Permanently delete a capture and remove its index entry.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Filename in inbox (e.g. '2026-04-02-some-slug.md')" },
      },
      required: ["filename"],
    },
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
    `## Applied to`,
    capture.appliedTo ?? "_not immediately obvious_",
    ``,
  ].join("\n");

  await githubPut(user.github_token, user.github_repo, `inbox/${filename}`, markdown, `capture: add ${filename}`);

  // Update INDEX.md
  const row = buildIndexRow(date, capture, filename);
  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (existing) {
    await githubPut(user.github_token, user.github_repo, "INDEX.md", existing.content + row, "capture: update index", existing.sha);
  }

  // Append inbox count as a nudge
  const inboxRes = await githubGet<Array<{ name: string }>>(user.github_token, user.github_repo, "inbox");
  const inboxCount = inboxRes.ok && inboxRes.data
    ? inboxRes.data.filter((f) => f.name.endsWith(".md")).length
    : 0;

  let result = `Captured: ${capture.inferredTitle}\nFile: inbox/${filename}\nTags: ${capture.tags.join(", ")}`;
  if (inboxCount > 0) {
    result += `\n\n---\n📬 You have ${inboxCount} item(s) in your inbox. Use list_inbox to review and apply them.`;
  }
  return result;
}

async function handleListInbox(user: User): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const res = await githubGet<Array<{ name: string }>>(user.github_token, user.github_repo, "inbox");
  if (!res.ok || !res.data) return "Inbox is empty.";
  const mdFiles = res.data.filter((f) => f.name.endsWith(".md"));
  if (mdFiles.length === 0) return "Inbox is empty.";

  // Read up to 10 files in parallel for summaries
  const toRead = mdFiles.slice(0, 10);
  const summaries = await Promise.all(
    toRead.map(async (f, i) => {
      const file = await readFile(user.github_token, user.github_repo!, `inbox/${f.name}`);
      if (!file) return `${i + 1}. ${f.name}\n   (could not read)`;

      const fmMatch = file.content.match(/^---\n([\s\S]*?)\n---/);
      const fm = fmMatch?.[1] ?? "";
      const source = fm.match(/^source:\s*(.+)$/m)?.[1] ?? "Unknown";
      const type = fm.match(/^type:\s*(.+)$/m)?.[1] ?? "unknown";
      const tags = fm.match(/^tags:\s*(.+)$/m)?.[1] ?? "";

      const coreMatch = file.content.match(/## Core idea\n([\s\S]*?)(?=\n##|$)/);
      const coreIdea = coreMatch?.[1]?.trim().slice(0, 120) ?? "";

      return `${i + 1}. ${f.name}\n   Source: ${source}\n   Type: ${type} | Tags: ${tags}\n   Core idea: ${coreIdea}`;
    }),
  );

  let result = `${mdFiles.length} capture(s) in inbox:\n\n${summaries.join("\n\n")}`;
  if (mdFiles.length > 10) {
    result += `\n\n... and ${mdFiles.length - 10} more.`;
  }
  return result;
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

async function handleReadCapture(user: User, args: { filename: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const path = args.filename.includes("/") ? args.filename : `inbox/${args.filename}`;
  const file = await readFile(user.github_token, user.github_repo, path);
  if (!file) return `File not found: ${path}. Use list_inbox to see available captures.`;
  return file.content;
}

async function handleApplyCapture(user: User, args: { filename: string; applied_note?: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const inboxPath = `inbox/${args.filename}`;
  const file = await readFile(user.github_token, user.github_repo, inboxPath);
  if (!file) return `File not found: ${inboxPath}. It may have already been processed.`;

  let content = file.content.replace(/^status:\s*inbox$/m, "status: applied");
  if (args.applied_note) {
    content = content.replace(
      /## Applied to\n[\s\S]*?(?=\n##|$)/,
      `## Applied to\n${args.applied_note}`,
    );
  }

  await githubPut(user.github_token, user.github_repo, `applied/${args.filename}`, content, `apply: ${args.filename}`);
  await githubDelete(user.github_token, user.github_repo, inboxPath, file.sha, `apply: remove ${args.filename} from inbox`);
  await updateIndexEntry(user.github_token, user.github_repo, args.filename, "apply");

  return `Applied: ${args.filename} → applied/${args.filename}`;
}

async function handleArchiveCapture(user: User, args: { filename: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const inboxPath = `inbox/${args.filename}`;
  const file = await readFile(user.github_token, user.github_repo, inboxPath);
  if (!file) return `File not found: ${inboxPath}. It may have already been processed.`;

  const content = file.content.replace(/^status:\s*inbox$/m, "status: archived");

  await githubPut(user.github_token, user.github_repo, `archived/${args.filename}`, content, `archive: ${args.filename}`);
  await githubDelete(user.github_token, user.github_repo, inboxPath, file.sha, `archive: remove ${args.filename} from inbox`);
  await updateIndexEntry(user.github_token, user.github_repo, args.filename, "archive");

  return `Archived: ${args.filename} → archived/${args.filename}`;
}

async function handleDeleteCapture(user: User, args: { filename: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  const inboxPath = `inbox/${args.filename}`;
  const file = await readFile(user.github_token, user.github_repo, inboxPath);
  if (!file) return `File not found: ${inboxPath}. It may have already been deleted.`;

  await githubDelete(user.github_token, user.github_repo, inboxPath, file.sha, `delete: ${args.filename}`);
  await updateIndexEntry(user.github_token, user.github_repo, args.filename, "delete");

  return `Deleted: ${args.filename}`;
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
          case "read_capture":
            result = await handleReadCapture(user, toolArgs as { filename: string });
            break;
          case "apply_capture":
            result = await handleApplyCapture(user, toolArgs as { filename: string; applied_note?: string });
            break;
          case "archive_capture":
            result = await handleArchiveCapture(user, toolArgs as { filename: string });
            break;
          case "delete_capture":
            result = await handleDeleteCapture(user, toolArgs as { filename: string });
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
