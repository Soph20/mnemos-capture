#!/usr/bin/env node

const HOSTED_URL = "https://mnemos-capture.vercel.app";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "serve-mcp") {
    const { serveMcp } = await import("./mcp-server.js");
    await serveMcp();
    return;
  }

  if (command === "setup-hooks") {
    const { setupHooks } = await import("./hooks.js");
    const keyIdx = args.indexOf("--key");
    const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
    if (!apiKey) {
      console.error("Usage: npx mnemos-capture setup-hooks --key YOUR_API_KEY [--briefing] [--vault]");
      process.exit(1);
    }
    setupHooks(apiKey, { briefing: args.includes("--briefing"), vault: args.includes("--vault") });
    return;
  }

  if (command === "inbox-check") {
    const { inboxCheck } = await import("./hooks.js");
    const keyIdx = args.indexOf("--key");
    const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
    if (!apiKey) process.exit(0); // silent fail in hook context
    await inboxCheck(apiKey, { briefing: args.includes("--briefing") });
    return;
  }

  if (command === "vault-check") {
    const { vaultCheck } = await import("./hooks.js");
    const keyIdx = args.indexOf("--key");
    const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : undefined;
    if (!apiKey) process.exit(0); // silent fail in hook context
    await vaultCheck(apiKey);
    return;
  }

  // Default: open the hosted app
  console.log("");
  console.log("  Mnemos — Knowledge capture for agentic workflows\n");
  console.log(`  Open ${HOSTED_URL} to start capturing.`);
  console.log("");
  console.log("  First time? Sign in with GitHub — setup takes 30 seconds.");
  console.log("");
  console.log("  Connect to Claude Code:");
  console.log("  claude mcp add mnemos -- npx -y mnemos-capture@latest serve-mcp --key YOUR_API_KEY");
  console.log("");

  // Try to open the URL in the default browser
  const { exec } = await import("child_process");
  const openCmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${openCmd} ${HOSTED_URL}`);
}

function printHelp(): void {
  console.log(`
  Mnemos — Knowledge capture for agentic workflows

  Usage:
    npx mnemos-capture                                         Open Mnemos in your browser
    npx mnemos-capture serve-mcp --key KEY                     Start the MCP server for Claude Code
    npx mnemos-capture setup-hooks --key KEY                   Install inbox count hook (fast)
    npx mnemos-capture setup-hooks --key KEY --briefing        Install full briefing hook (uses LLM)
    npx mnemos-capture setup-hooks --key KEY --vault           Install vault hook (PreToolCall)
    npx mnemos-capture setup-hooks --key KEY --briefing --vault  Install both hooks
    npx mnemos-capture help                                    Show this help

  MCP tools (via Claude Code):
    briefing          — Session-start briefing with ranked insights to apply
    generate_plan     — Turn selected captures into a full implementation plan
    vault_scan        — Scan all captures for relevance to current activity
    curate            — Validate URLs and flag stale captures

  Get started:
    1. Run: npx mnemos-capture
    2. Sign in with GitHub (creates your knowledge repo automatically)
    3. Set a PIN for quick mobile access
    4. Start capturing!

  Connect to Claude Code:
    claude mcp add mnemos -- npx -y mnemos-capture@latest serve-mcp --key YOUR_API_KEY

  The @latest tag ensures every Claude Code session uses the most recent
  published version. serve-mcp also self-upgrades on startup as a safety net
  for users who registered without @latest.

  The hook is installed automatically when you start the MCP server.
  To upgrade to a full project briefing at session start:
    npx mnemos-capture setup-hooks --key YOUR_API_KEY --briefing

  To enable the vault (surfaces captures as you edit files — opt-in):
    npx mnemos-capture setup-hooks --key YOUR_API_KEY --vault
  `);
}

main().catch((err: unknown) => {
  console.error("Error:", err);
  process.exit(1);
});
