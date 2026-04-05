import { NextRequest, NextResponse } from "next/server";
import { getUserByApiKey } from "@/lib/db";
import type { User } from "@/lib/db";
import { githubGet, githubPut, githubDelete, readFile, updateIndexEntry } from "@/lib/github";
import { extractCapture, formatDate, buildIndexRow, rankByRelevance, composeBriefing, generateApplicationSuggestions } from "@/lib/llm";
import { linkCapture } from "@/lib/linking";
import { synthesizeTopic } from "@/lib/synthesis";
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
    description: "Mark a capture as applied. Records how and where the knowledge was used. Moves from inbox/ to applied/, updates status, index, and triggers rule re-synthesis.",
    inputSchema: {
      type: "object" as const,
      properties: {
        filename: { type: "string", description: "Filename in inbox (e.g. '2026-04-02-some-slug.md')" },
        applied_note: { type: "string", description: "Brief note on how/where the capture was applied (e.g. 'Added as CLAUDE.md rule for error handling')" },
        target_file: { type: "string", description: "File path where the knowledge was applied (e.g. 'CLAUDE.md', 'src/utils/pricing.ts')" },
        outcome: { type: "string", description: "What changed as a result (e.g. 'Reduced error rate by rewriting retry logic per capture advice')" },
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
  {
    name: "recall",
    description: "Describe your current task or problem, and get back the most relevant knowledge from your capture library. More powerful than keyword search — understands semantic relevance.",
    inputSchema: {
      type: "object" as const,
      properties: {
        context: { type: "string", description: "What you're working on or thinking about (1-3 sentences)" },
        max_results: { type: "number", description: "Max captures to return (default 5, max 10)" },
      },
      required: ["context"],
    },
  },
  {
    name: "synthesize",
    description: "Synthesize accumulated knowledge on a topic into actionable rules. Updates RULES.md in your knowledge repo. Can target a specific tag or synthesize all knowledge.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tag: { type: "string", description: "Tag to synthesize (e.g. 'product-discovery'). Required." },
      },
      required: ["tag"],
    },
  },
  {
    name: "get_rules",
    description: "Get the synthesized knowledge rules file. Use to populate a project's CLAUDE.md or system prompt with accumulated knowledge. Returns RULES.md content.",
    inputSchema: {
      type: "object" as const,
      properties: {
        tag: { type: "string", description: "Filter to rules for a specific tag/topic. Omit for all rules." },
      },
    },
  },
  {
    name: "briefing",
    description: "Get a session-start briefing of relevant knowledge for your current project. Combines relevant rules, recent captures, and applicable insights into a concise summary.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_context: { type: "string", description: "Describe the project you're working on (tech stack, domain, current focus area)" },
        include_rules: { type: "boolean", description: "Include synthesized rules in the briefing (default true)" },
      },
      required: ["project_context"],
    },
  },
  {
    name: "apply_to_context",
    description: "Describe your current task, stack, and optionally paste code — get back concrete, code-level suggestions for applying captured knowledge. Translates insights into specific guidance for your codebase.",
    inputSchema: {
      type: "object" as const,
      properties: {
        task: { type: "string", description: "What you're building or fixing" },
        stack: { type: "string", description: "Tech stack (e.g. 'Next.js, TypeScript, Stripe')" },
        files: {
          type: "array" as const,
          items: { type: "string" },
          description: "File paths you're working on (e.g. ['src/api/payments.ts'])",
        },
        code_snippet: { type: "string", description: "Relevant code snippet for targeted suggestions" },
      },
      required: ["task"],
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

  // Auto-link to related captures
  let linkedCount = 0;
  if (existing) {
    try {
      const related = await linkCapture(user.llm_api_key!, user.github_token, user.github_repo, capture, filename, "inbox", existing.content);
      linkedCount = related.length;
    } catch {
      // Linking is best-effort — don't fail the capture
    }
  }

  // Append inbox count as a nudge
  const inboxRes = await githubGet<Array<{ name: string }>>(user.github_token, user.github_repo, "inbox");
  const inboxCount = inboxRes.ok && inboxRes.data
    ? inboxRes.data.filter((f) => f.name.endsWith(".md")).length
    : 0;

  let result = `Captured: ${capture.inferredTitle}\nFile: inbox/${filename}\nTags: ${capture.tags.join(", ")}`;
  if (linkedCount > 0) {
    result += `\nLinked to ${linkedCount} related capture(s).`;
  }
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

async function handleApplyCapture(user: User, args: { filename: string; applied_note?: string; target_file?: string; outcome?: string }): Promise<string> {
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

  // Add application log
  const today = new Date().toISOString().split("T")[0];
  const logLines = [`- **Applied:** ${today}`];
  if (args.target_file) logLines.push(`- **Target:** ${args.target_file}`);
  if (args.applied_note) logLines.push(`- **Note:** ${args.applied_note}`);
  logLines.push(`- **Outcome:** ${args.outcome ?? "_pending_"}`);

  // Insert application log before "Links to memory" or at the end
  const appLogSection = `\n## Application log\n${logLines.join("\n")}\n`;
  if (content.includes("## Links to memory")) {
    content = content.replace("## Links to memory", `${appLogSection}\n## Links to memory`);
  } else {
    content = content.trimEnd() + `\n${appLogSection}`;
  }

  await githubPut(user.github_token, user.github_repo, `applied/${args.filename}`, content, `apply: ${args.filename}`);
  await githubDelete(user.github_token, user.github_repo, inboxPath, file.sha, `apply: remove ${args.filename} from inbox`);
  await updateIndexEntry(user.github_token, user.github_repo, args.filename, "apply");

  // Trigger re-synthesis for the capture's tags (best-effort)
  if (user.llm_api_key) {
    try {
      const tagsMatch = content.match(/^tags:\s*(.+)$/m);
      if (tagsMatch?.[1]) {
        const tags = tagsMatch[1].split(",").map((t) => t.trim()).filter(Boolean);
        const indexFile = await readFile(user.github_token, user.github_repo, "INDEX.md");
        if (indexFile && tags.length > 0) {
          // Re-synthesize the first tag (limit API calls)
          await synthesizeTopic(user.llm_api_key, user.github_token, user.github_repo, tags[0]!, indexFile.content);
        }
      }
    } catch {
      // Re-synthesis is best-effort
    }
  }

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

async function handleRecall(user: User, args: { context: string; max_results?: number }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  if (!user.llm_api_key) return "API key not configured.";

  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (!existing) return "No captures yet. Use the capture tool to build your knowledge base.";

  const maxResults = Math.min(args.max_results ?? 5, 10);
  const ranked = await rankByRelevance(user.llm_api_key, args.context, existing.content, maxResults);

  if (ranked.length === 0) return `No relevant captures found for: "${args.context}"`;

  // Read top captures in parallel
  const captures = await Promise.all(
    ranked.map(async (r) => {
      const file = await readFile(user.github_token, user.github_repo!, r.filename);
      if (!file) return null;

      // Extract core idea and takeaways for a compact summary
      const coreMatch = file.content.match(/## Core idea\n([\s\S]*?)(?=\n##)/);
      const takeawaysMatch = file.content.match(/## Key takeaways\n([\s\S]*?)(?=\n##)/);
      const coreIdea = coreMatch?.[1]?.trim() ?? "";
      const takeaways = takeawaysMatch?.[1]?.trim() ?? "";

      return `### ${r.filename} (relevance: ${Math.round(r.score * 100)}%)\n**Why relevant:** ${r.reason}\n**Core idea:** ${coreIdea}\n**Takeaways:**\n${takeaways}`;
    }),
  );

  const validCaptures = captures.filter((c): c is string => c !== null);
  return `Found ${validCaptures.length} relevant capture(s) for: "${args.context}"\n\n${validCaptures.join("\n\n---\n\n")}`;
}

async function handleSynthesize(user: User, args: { tag: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  if (!user.llm_api_key) return "API key not configured.";

  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (!existing) return "No captures yet.";

  const result = await synthesizeTopic(user.llm_api_key, user.github_token, user.github_repo, args.tag, existing.content);

  if (result.rules.length === 0) {
    return `No captures found matching tag "${args.tag}". Use search_captures to find available tags.`;
  }

  return `Synthesized ${result.rules.length} rule(s) for "${result.topic}" and updated RULES.md:\n\n${result.rules.map((r, i) => `${i + 1}. ${r}`).join("\n")}`;
}

async function handleGetRules(user: User, args: { tag?: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";

  const file = await readFile(user.github_token, user.github_repo, "RULES.md");
  if (!file) return "No rules generated yet. Use the synthesize tool to create rules from your captures.";

  if (!args.tag) return file.content;

  // Extract the section for the requested tag
  const sectionRegex = new RegExp(
    `## ${args.tag}[^\n]*\n((?:- [^\n]+\n?)*)`,
    "im",
  );
  const match = file.content.match(sectionRegex);
  if (!match) return `No rules found for "${args.tag}". Available topics are listed in RULES.md.`;

  return `## ${args.tag}\n${match[1]}`;
}

async function handleBriefing(user: User, args: { project_context: string; include_rules?: boolean }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  if (!user.llm_api_key) return "API key not configured.";

  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (!existing) return "No captures yet. Build your knowledge base with the capture tool first.";

  // 1. Find relevant captures
  const ranked = await rankByRelevance(user.llm_api_key, args.project_context, existing.content, 5);

  // 2. Read relevant capture contents in parallel
  const relevantCaptures = await Promise.all(
    ranked.map(async (r) => {
      const file = await readFile(user.github_token, user.github_repo!, r.filename);
      return file?.content ?? null;
    }),
  );
  const validCaptures = relevantCaptures.filter((c): c is string => c !== null);

  // 3. Read rules (if requested)
  let rules = "";
  if (args.include_rules !== false) {
    const rulesFile = await readFile(user.github_token, user.github_repo, "RULES.md");
    rules = rulesFile?.content ?? "";
  }

  // 4. Read recent inbox
  const inboxRes = await githubGet<Array<{ name: string }>>(user.github_token, user.github_repo, "inbox");
  const recentInbox: string[] = [];
  if (inboxRes.ok && inboxRes.data) {
    const mdFiles = inboxRes.data.filter((f) => f.name.endsWith(".md")).slice(-3);
    const inboxContents = await Promise.all(
      mdFiles.map(async (f) => {
        const file = await readFile(user.github_token, user.github_repo!, `inbox/${f.name}`);
        return file?.content ?? null;
      }),
    );
    recentInbox.push(...inboxContents.filter((c): c is string => c !== null));
  }

  // 5. Compose briefing via LLM
  return composeBriefing(user.llm_api_key, args.project_context, validCaptures, rules, recentInbox);
}

async function handleApplyToContext(user: User, args: { task: string; stack?: string; files?: string[]; code_snippet?: string }): Promise<string> {
  if (!user.github_repo) return "Knowledge repo not configured.";
  if (!user.llm_api_key) return "API key not configured.";

  const existing = await readFile(user.github_token, user.github_repo, "INDEX.md");
  if (!existing) return "No captures yet.";

  // Build a rich task context from all provided info
  const contextParts = [`Task: ${args.task}`];
  if (args.stack) contextParts.push(`Stack: ${args.stack}`);
  if (args.files?.length) contextParts.push(`Files: ${args.files.join(", ")}`);
  if (args.code_snippet) contextParts.push(`Code:\n\`\`\`\n${args.code_snippet}\n\`\`\``);
  const taskContext = contextParts.join("\n");

  // Find relevant captures
  const ranked = await rankByRelevance(user.llm_api_key, taskContext, existing.content, 7);
  if (ranked.length === 0) return `No relevant captures found for this task context.`;

  // Read capture contents
  const contents = await Promise.all(
    ranked.map(async (r) => {
      const file = await readFile(user.github_token, user.github_repo!, r.filename);
      return file?.content ?? null;
    }),
  );
  const validContents = contents.filter((c): c is string => c !== null);

  if (validContents.length === 0) return "Could not read relevant captures.";

  // Generate application suggestions
  return generateApplicationSuggestions(user.llm_api_key, taskContext, validContents);
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
            result = await handleApplyCapture(user, toolArgs as { filename: string; applied_note?: string; target_file?: string; outcome?: string });
            break;
          case "archive_capture":
            result = await handleArchiveCapture(user, toolArgs as { filename: string });
            break;
          case "delete_capture":
            result = await handleDeleteCapture(user, toolArgs as { filename: string });
            break;
          case "recall":
            result = await handleRecall(user, toolArgs as { context: string; max_results?: number });
            break;
          case "synthesize":
            result = await handleSynthesize(user, toolArgs as { tag: string });
            break;
          case "get_rules":
            result = await handleGetRules(user, toolArgs as { tag?: string });
            break;
          case "briefing":
            result = await handleBriefing(user, toolArgs as { project_context: string; include_rules?: boolean });
            break;
          case "apply_to_context":
            result = await handleApplyToContext(user, toolArgs as { task: string; stack?: string; files?: string[]; code_snippet?: string });
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
