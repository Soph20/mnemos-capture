import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

describe("config", () => {
  let tmpDir: string;
  let configPath: string;
  let origHome: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "mnemos-config-test-"));
    configPath = join(tmpDir, ".mnemos", "config.json");
    origHome = process.env["HOME"];
    process.env["HOME"] = tmpDir;
    // Module-level CONFIG_DIR is computed from homedir() at import — reset cache
    vi.resetModules();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env["HOME"] = origHome;
  });

  it("returns an empty object when no config exists", async () => {
    const { readConfig } = await import("../config.js");
    expect(readConfig()).toEqual({});
  });

  it("writes and reads back the agent field", async () => {
    const { setConfigField, readConfig } = await import("../config.js");
    setConfigField("agent", "claude -p");
    expect(readConfig().agent).toBe("claude -p");
    expect(existsSync(configPath)).toBe(true);
  });

  it("persists the agent command verbatim, including flags", async () => {
    const { setConfigField } = await import("../config.js");
    setConfigField("agent", "aider --yes --message");
    const saved = JSON.parse(readFileSync(configPath, "utf-8")) as { agent: string };
    expect(saved.agent).toBe("aider --yes --message");
  });

  it("preserves other fields when updating one", async () => {
    const { setConfigField, readConfig } = await import("../config.js");
    setConfigField("key", "mnemos_abc123");
    setConfigField("agent", "codex exec");
    const cfg = readConfig();
    expect(cfg.key).toBe("mnemos_abc123");
    expect(cfg.agent).toBe("codex exec");
  });

  it("throws on an unknown config field", async () => {
    const { setConfigField } = await import("../config.js");
    expect(() => setConfigField("provider", "openai")).toThrow(/Unknown config field/);
  });
});
