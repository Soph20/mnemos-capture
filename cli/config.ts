/**
 * Xmu CLI config — stores which AI assistant kos should drive, and an
 * optional API key, in ~/.xmu/config.json. Falls back to ~/.mnemos/config.json.
 */

import { homedir } from "os";
import { join } from "path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";

function xmuDir(): string {
  return join(homedir(), ".xmu");
}

function legacyDir(): string {
  return join(homedir(), ".mnemos");
}

function xmuPath(): string {
  return join(xmuDir(), "config.json");
}

function legacyPath(): string {
  return join(legacyDir(), "config.json");
}

/** Path we currently read from: new dir if present, else the mnemos fallback. */
function readPath(): string {
  if (existsSync(xmuPath())) return xmuPath();
  if (existsSync(legacyPath())) return legacyPath();
  return xmuPath();
}

export interface MnemosConfig {
  /** Shell command that launches the user's AI assistant, e.g. "claude -p". */
  agent?: string;
  /** Optional stored MCP API key so kos can run without --key. */
  key?: string;
}

const ALLOWED_FIELDS = ["agent", "key"] as const;
type ConfigField = (typeof ALLOWED_FIELDS)[number];

export function readConfig(): MnemosConfig {
  const path = readPath();
  if (!existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as MnemosConfig;
  } catch {
    return {};
  }
}

export function writeConfig(cfg: MnemosConfig): void {
  const dir = xmuDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(xmuPath(), JSON.stringify(cfg, null, 2) + "\n");
}

export function setConfigField(field: string, value: string): void {
  if (!ALLOWED_FIELDS.includes(field as ConfigField)) {
    throw new Error(`Unknown config field: ${field}. Allowed: ${ALLOWED_FIELDS.join(", ")}`);
  }
  const cfg = readConfig();
  cfg[field as ConfigField] = value;
  writeConfig(cfg);
}

/** Route `xmu config <set|get> ...`. */
export function runConfigCommand(args: string[]): void {
  const action = args[0];

  if (action === "set") {
    const field = args[1];
    const value = args.slice(2).join(" ");
    if (!field || !value) {
      console.error("Usage: xmu config set <field> <value>");
      console.error('  e.g. xmu config set agent "claude -p"');
      process.exit(1);
    }
    try {
      setConfigField(field, value);
      console.log(`Set ${field} = ${value}`);
      console.log(`Saved to ${xmuPath()}`);
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

  console.error("Usage: xmu config set|get <field> [value]");
  process.exit(1);
}
