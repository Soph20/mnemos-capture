import { homedir } from "os";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

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

export function setupHooks(apiKey: string): void {
  const settings = readSettings();
  const hooks = settings.hooks ?? {};
  const sessionStart: HookGroup[] = hooks.SessionStart ?? [];

  const command = `npx mnemos-capture inbox-check --key ${apiKey}`;

  // Remove any existing mnemos inbox-check hook (handles key rotation too)
  const filtered = sessionStart.map((group) => ({
    ...group,
    hooks: (group.hooks ?? []).filter(
      (h) => !(typeof h.command === "string" && h.command.includes(HOOK_MARKER)),
    ),
  })).filter((group) => (group.hooks ?? []).length > 0);

  // Add the new hook as its own group
  filtered.push({ hooks: [{ type: "command", command }] });

  settings.hooks = { ...hooks, SessionStart: filtered };
  writeSettings(settings);

  console.log("Mnemos inbox hook installed.");
  console.log(`Location: ${CLAUDE_SETTINGS_PATH}`);
  console.log("At the start of each Claude Code session you'll see your inbox count.");
}

export async function inboxCheck(apiKey: string): Promise<void> {
  try {
    const res = await fetch(HOSTED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "tools/call",
        params: { name: "list_inbox", arguments: {} },
        id: 1,
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return;

    const data = (await res.json()) as { result?: { content?: Array<{ text?: string }> } };
    const text = data.result?.content?.[0]?.text ?? "";

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
