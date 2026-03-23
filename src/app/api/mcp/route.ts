/**
 * MCP endpoint — mnemos knowledge layer
 *
 * Implements the MCP JSON-RPC 2.0 protocol over HTTP (streamable transport).
 * Serves the full Lenny knowledge base (305 structured insight files) to any
 * Claude Code session that points its .mcp.json at this URL.
 *
 * Tools:
 *   search_lenny   — keyword search → returns full matching insight files
 *   get_insights   — fetch full files for specific speakers by name
 *   list_speakers  — browse all 305 speakers + their topics
 *
 * Auth: Bearer token via MCP_SECRET env var (optional — skip in dev).
 */

import { NextRequest, NextResponse } from "next/server";

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const GITHUB_REPO = process.env.GITHUB_REPO ?? "";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH ?? "main";
const MCP_SECRET = process.env.MCP_SECRET ?? "";

const MCP_PROTOCOL_VERSION = "2024-11-05";
const SERVER_NAME = "mnemos";
const SERVER_VERSION = "1.0.0";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string };
}

interface SearchLennyArgs {
  query: string;
  max_results?: number;
}

interface GetInsightsArgs {
  speakers: string[];
}

interface IndexRow {
  slug: string;
  speaker: string;
  role: string;
  topics: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(req: NextRequest): boolean {
  if (!MCP_SECRET) return true; // No secret set → open (safe for dev)
  const auth = req.headers.get("authorization") ?? "";
  return auth === `Bearer ${MCP_SECRET}`;
}

// ─── GitHub helpers ───────────────────────────────────────────────────────────

async function githubGetContent(filePath: string): Promise<string | null> {
  // Encode each segment separately to preserve slashes
  const encodedPath = filePath
    .split("/")
    .map(encodeURIComponent)
    .join("/");

  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodedPath}?ref=${GITHUB_BRANCH}`,
    {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      cache: "no-store",
    }
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub GET ${filePath}: HTTP ${res.status}`);

  const data = (await res.json()) as { content: string };
  return Buffer.from(data.content.replace(/\n/g, ""), "base64").toString("utf-8");
}

// ─── Index parser ─────────────────────────────────────────────────────────────

function parseIndexRows(indexContent: string): IndexRow[] {
  return indexContent
    .split("\n")
    .filter(
      (line) =>
        line.startsWith("|") &&
        !line.includes("---") &&
        !line.includes("| Slug") &&
        !line.includes("| Speaker")
    )
    .map((line) => {
      const cols = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cols.length < 4) return null;
      return {
        slug: cols[0] ?? "",
        speaker: cols[1] ?? "",
        role: cols[2] ?? "",
        topics: cols[3] ?? "",
      };
    })
    .filter((r): r is IndexRow => r !== null);
}

function scoreRow(row: IndexRow, terms: string[]): number {
  const text = `${row.slug} ${row.speaker} ${row.role} ${row.topics}`.toLowerCase();
  return terms.reduce((acc, term) => acc + (text.includes(term) ? 1 : 0), 0);
}

// ─── Tool: search_lenny ───────────────────────────────────────────────────────

async function searchLenny(args: SearchLennyArgs): Promise<string> {
  const { query, max_results = 8 } = args;
  const capped = Math.min(max_results, 12);
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);

  const indexContent = await githubGetContent("lenny/INDEX.md");
  if (!indexContent) {
    return "Lenny knowledge index not found. Check that lenny/INDEX.md exists in the repo.";
  }

  const rows = parseIndexRows(indexContent);

  const matches = rows
    .map((row) => ({ row, score: scoreRow(row, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, capped)
    .map(({ row }) => row);

  if (matches.length === 0) {
    return (
      `No Lenny insights matched "${query}".\n` +
      `Try broader terms: prioritization, growth, PLG, metrics, strategy, hiring, ` +
      `discovery, roadmap, pricing, retention, experimentation, OKRs, stakeholders, ` +
      `leadership, scaling, product-market fit, user research, frameworks.`
    );
  }

  // Fetch full insight files in parallel
  const files = await Promise.all(
    matches.map(async ({ slug, speaker }) => {
      const content = await githubGetContent(`lenny/${slug}-insights.md`);
      return content ?? `## ${speaker}\n_Insight file not found for slug: ${slug}_\n`;
    })
  );

  return (
    `# Lenny Insights — "${query}"\n\n` +
    `${matches.length} expert(s) matched. Full structured insights below.\n\n` +
    `---\n\n` +
    files.join("\n\n---\n\n")
  );
}

// ─── Tool: get_insights ───────────────────────────────────────────────────────

async function getInsights(args: GetInsightsArgs): Promise<string> {
  const { speakers } = args;

  if (!speakers.length) return "No speakers provided.";

  const files = await Promise.all(
    speakers.map(async (speaker) => {
      const content = await githubGetContent(`lenny/${speaker}-insights.md`);
      if (!content) {
        return (
          `## ${speaker}\n` +
          `_Not found. Use \`list_speakers\` to find the exact slug._\n`
        );
      }
      return content;
    })
  );

  return files.join("\n\n---\n\n");
}

// ─── Tool: list_speakers ──────────────────────────────────────────────────────

async function listSpeakers(): Promise<string> {
  const content = await githubGetContent("lenny/INDEX.md");
  if (!content) return "Lenny index not found.";
  return content;
}

// ─── Tool registry ────────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: "search_lenny",
    description:
      "Search 305 structured Lenny Rachitsky podcast insights from top PMs, founders, and product leaders. " +
      "Returns FULL insight files — frameworks, key insights, product decision patterns, anti-patterns, heuristics, and direct quotes. " +
      "Use this to back up any product decision, interview answer, roadmap choice, prioritization call, or PM/founder reasoning with real expert knowledge. " +
      "Always query this before making product recommendations.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "Search query. Topics: prioritization, growth, PLG, metrics, hiring, strategy, " +
            "discovery, roadmap, pricing, retention, experimentation, OKRs, stakeholders, " +
            "leadership, scaling, product-market fit, user research. Or a speaker name.",
        },
        max_results: {
          type: "number",
          description: "Number of full insight files to return. Default: 8. Max: 12.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_insights",
    description:
      "Fetch full structured insight files for specific speakers by name. " +
      "Use when you know exactly which expert's thinking is most relevant. " +
      "Returns complete frameworks, patterns, anti-patterns, heuristics, and direct quotes.",
    inputSchema: {
      type: "object" as const,
      properties: {
        speakers: {
          type: "array",
          items: { type: "string" },
          description:
            "Speaker slugs — exact names as in list_speakers. " +
            "Examples: 'Shreyas Doshi', 'Elena Verna 2.0', 'Brian Chesky', 'Marty Cagan'. " +
            "Can fetch multiple at once.",
        },
      },
      required: ["speakers"],
    },
  },
  {
    name: "list_speakers",
    description:
      "Browse all 305 speakers in the Lenny knowledge base with their roles, companies, and topics. " +
      "Use to discover available experts or find exact speaker names before calling get_insights.",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
];

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

function ok(id: number | string | null, result: unknown): JsonRpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(
  id: number | string | null,
  code: number,
  message: string
): JsonRpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

// ─── Method dispatcher ────────────────────────────────────────────────────────

async function dispatch(req: JsonRpcRequest): Promise<JsonRpcResponse> {
  const { id, method, params } = req;

  switch (method) {
    case "initialize":
      return ok(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        capabilities: { tools: {} },
      });

    case "notifications/initialized":
      return ok(id, {});

    case "tools/list":
      return ok(id, { tools: TOOLS });

    case "tools/call": {
      const p = params as { name?: string; arguments?: Record<string, unknown> };
      const toolName = p?.name;
      const toolArgs = p?.arguments ?? {};

      try {
        let text: string;
        switch (toolName) {
          case "search_lenny":
            text = await searchLenny(toolArgs as unknown as SearchLennyArgs);
            break;
          case "get_insights":
            text = await getInsights(toolArgs as unknown as GetInsightsArgs);
            break;
          case "list_speakers":
            text = await listSpeakers();
            break;
          default:
            return rpcError(id, -32601, `Unknown tool: ${String(toolName)}`);
        }
        return ok(id, { content: [{ type: "text", text }] });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return ok(id, {
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${method}`);
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return NextResponse.json(
      { error: "GITHUB_TOKEN and GITHUB_REPO not configured" },
      { status: 500 }
    );
  }

  let body: JsonRpcRequest;
  try {
    body = (await req.json()) as JsonRpcRequest;
  } catch {
    return NextResponse.json(rpcError(null, -32700, "Parse error: invalid JSON"), {
      status: 400,
    });
  }

  const response = await dispatch(body);
  return NextResponse.json(response);
}

// Health check + discovery
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: "ok",
    server: SERVER_NAME,
    version: SERVER_VERSION,
    protocol: MCP_PROTOCOL_VERSION,
    tools: TOOLS.map((t) => t.name),
  });
}
