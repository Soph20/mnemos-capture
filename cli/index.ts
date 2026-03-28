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
    // MCP server mode — proxies to hosted instance
    const { serveMcp } = await import("./mcp-server.js");
    await serveMcp();
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
  console.log("  claude mcp add mnemos -- npx mnemos-capture serve-mcp --key YOUR_API_KEY");
  console.log("");

  // Try to open the URL in the default browser
  const { exec } = await import("child_process");
  const openCmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${openCmd} ${HOSTED_URL}`);
}

function printHelp(): void {
  console.log(`
  Mnemos — Knowledge capture for agentic workflows

  Usage:
    npx mnemos-capture              Open Mnemos in your browser
    npx mnemos-capture serve-mcp    Start the MCP server for Claude Code
    npx mnemos-capture help         Show this help

  Get started:
    1. Run: npx mnemos-capture
    2. Sign in with GitHub (creates your knowledge repo automatically)
    3. Set a PIN for quick mobile access
    4. Start capturing!

  Connect to Claude Code:
    claude mcp add mnemos -- npx mnemos-capture serve-mcp --key YOUR_API_KEY
  `);
}

main().catch((err: unknown) => {
  console.error("Error:", err);
  process.exit(1);
});
