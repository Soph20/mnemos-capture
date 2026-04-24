import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const HOSTED_URL = "https://mnemos-capture.vercel.app/api/mcp";
const CLAUDE_SETTINGS_PATH = join(homedir(), ".claude", "settings.json");
const HOOK_MARKER = "mnemos-capture inbox-check";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Settings = Record<string, any>;
type HookGroup = { hooks?: HookEntry[] };
type HookEntry = { type: string; command: string };

function readSettings(): Settings {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8")) as Settings;
  } catch {
    return {};
  }
}

function writeSettings(settings: Settings): void {
  const dir = join(homedir(), ".claude");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

export function setupHooks(
  apiKey: string,
  opts: { briefing?: boolean; silent?: boolean } = {},
): void {
  const settings = readSettings();
  const hooks = settings.hooks ?? {};
  const sessionStart: HookGroup[] = hooks.SessionStart ?? [];

  const command = opts.briefing
    ? `npx mnemos-capture inbox-check --key ${apiKey} --briefing`
    : `npx mnemos-capture inbox-check --key ${apiKey}`;

  // Remove any existing mnemos inbox-check hook (handles key rotation too)
  const filtered = sessionStart
    .map((group: HookGroup) => ({
      ...group,
      hooks: (group.hooks ?? []).filter(
        (h: HookEntry) => !(typeof h.command === "string" && h.command.includes(HOOK_MARKER)),
      ),
    }))
    .filter((group: HookGroup) => (group.hooks ?? []).length > 0);

  filtered.push({ hooks: [{ type: "command", command }] });

  settings.hooks = { ...hooks, SessionStart: filtered };
  writeSettings(settings);

  if (!opts.silent) {
    console.log("Mnemos inbox hook installed.");
    console.log(`Location: ${CLAUDE_SETTINGS_PATH}`);
    if (opts.briefing) {
      console.log("At the start of each Claude Code session you'll see a full project briefing.");
    } else {
      console.log("At the start of each Claude Code session you'll see your inbox count.");
    }
  }
}

function run(cmd: string): string {
  return execSync(cmd, { timeout: 2000, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

function detectProjectContext(): string {
  const parts: string[] = [];

  // Repo name
  try {
    const remote = run("git remote get-url origin");
    const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
    const repo = match?.[1] ?? run("git rev-parse --show-toplevel").split("/").pop();
    if (repo) parts.push(`Project: ${repo}`);
  } catch {
    const dir = process.cwd().split("/").pop();
    if (dir) parts.push(`Project: ${dir}`);
  }

  // Current branch
  try {
    const branch = run("git branch --show-current");
    if (branch) parts.push(`Branch: ${branch}`);
  } catch {}

  // Recent commits (last 5)
  try {
    const log = run("git log --oneline -5");
    if (log) parts.push(`Recent commits:\n${log}`);
  } catch {}

  // CLAUDE.md — first 800 chars gives the model real project intent
  try {
    const root = run("git rev-parse --show-toplevel");
    const claudeMd = readFileSync(join(root, "CLAUDE.md"), "utf-8").slice(0, 800).trim();
    if (claudeMd) parts.push(`Project instructions (CLAUDE.md excerpt):\n${claudeMd}`);
  } catch {}

  return parts.length > 0 ? parts.join("\n\n") : "current project";
}

async function callMcp(
  apiKey: string,
  toolName: string,
  toolArgs: Record<string, unknown>,
): Promise<string | null> {
  const res = await fetch(HOSTED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
      id: 1,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
  return data.result?.content?.[0]?.text ?? null;
}

export async function inboxCheck(
  apiKey: string,
  opts: { briefing?: boolean } = {},
): Promise<void> {
  try {
    if (opts.briefing) {
      const projectContext = detectProjectContext();
      const text = await callMcp(apiKey, "briefing", { project_context: projectContext });
      if (text?.trim()) process.stdout.write(text.trim() + "\n");
      return;
    }

    // Default: fast count via list_inbox (no LLM call)
    const text = await callMcp(apiKey, "list_inbox", {});
    if (!text) return;

    // list_inbox returns "N capture(s) in inbox:" or "Inbox is empty."
    const match = text.match(/^(\d+)\s+capture/);
    if (!match) return;

    const count = parseInt(match[1] as string, 10);
    if (count > 0) {
      process.stdout.write(
        `Mnemos: ${count} capture${count === 1 ? "" : "s"} in inbox — run list_inbox to review\n`,
      );
    }
  } catch {
    // Silent fail — never interrupt a session startup
  }
}
