/**
 * mnemos CLI config — stores which AI assistant kos should drive, and an
 * optional API key, in ~/.mnemos/config.json. Provider/agent-agnostic: the
 * user tells mnemos the exact command to launch their assistant.
 */

import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

const CONFIG_DIR = join(homedir(), ".mnemos");
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export interface MnemosConfig {
  /** Shell command that launches the user's AI assistant, e.g. "claude -p". */
  agent?: string;
  /** Optional stored MCP API key so kos can run without --key. */
  key?: string;
}

const ALLOWED_FIELDS = ["agent", "key"] as const;
type ConfigField = (typeof ALLOWED_FIELDS)[number];

export function readConfig(): MnemosConfig {
  if (!existsSync(CONFIG_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as MnemosConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: MnemosConfig): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n");
}

export function setConfigField(field: string, value: string): void {
  if (!ALLOWED_FIELDS.includes(field as ConfigField)) {
    throw new Error(`Unknown config field: ${field}. Allowed: ${ALLOWED_FIELDS.join(", ")}`);
  }
  const cfg = readConfig();
  cfg[field as ConfigField] = value;
  writeConfig(cfg);
}

/** Route `mnemos config <set|get> ...`. */
export function runConfigCommand(args: string[]): void {
  const action = args[0];

  if (action === "set") {
    const field = args[1];
    const value = args.slice(2).join(" ");
    if (!field || !value) {
      console.error('Usage: mnemos config set <field> <value>');
      console.error('  e.g. mnemos config set agent "claude -p"');
      process.exit(1);
    }
    try {
      setConfigField(field, value);
      console.log(`Set ${field} = ${value}`);
      console.log(`Saved to ${CONFIG_PATH}`);
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  if (action === "get") {
    const cfg = readConfig();
    const field = args[1];
    if (field) {
      console.log(cfg[field as ConfigField] ?? "(not set)");
    } else {
      console.log(JSON.stringify(cfg, null, 2));
    }
    return;
  }

  console.error("Usage: mnemos config set|get <field> [value]");
  process.exit(1);
}
