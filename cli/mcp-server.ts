// MCP server that runs locally via stdio and proxies to the hosted Mnemos API.
// Used by Claude Code: claude mcp add mnemos -- npx mnemos-capture serve-mcp --key <api-key>

const HOSTED_URL = "https://mnemos-capture.vercel.app/api/mcp";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

function sendMessage(msg: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(msg)}\n`);
}

async function proxyToHosted(apiKey: string, msg: JsonRpcMessage): Promise<void> {
  try {
    const res = await fetch(HOSTED_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(msg),
    });

    const data = (await res.json()) as Record<string, unknown>;
    sendMessage(data);
  } catch (err) {
    sendMessage({
      jsonrpc: "2.0",
      id: msg.id,
      error: { code: -32603, message: err instanceof Error ? err.message : "Proxy error" },
    });
  }
}

export async function serveMcp(): Promise<void> {
  // Parse --key flag
  const args = process.argv.slice(2);
  const keyIdx = args.indexOf("--key");
  const apiKey = keyIdx !== -1 ? args[keyIdx + 1] : undefined;

  if (!apiKey) {
    process.stderr.write("\nMnemos MCP server requires an API key.\n");
    process.stderr.write("Usage: npx -y mnemos-capture@latest serve-mcp --key <your-api-key>\n\n");
    process.stderr.write("Get your API key at: https://mnemos-capture.vercel.app/onboard\n\n");
    process.exit(1);
  }

  // Self-upgrade: if a newer version exists on npm, respawn via npx @latest.
  // Handled before anything else so stdio isn't yet owned by the MCP loop.
  try {
    const { maybeSelfUpgrade } = await import("./version-check.js");
    const upgrading = await maybeSelfUpgrade();
    if (upgrading) return; // child has taken over; parent will exit when child does
  } catch {
    // Version check must never block startup
  }

  // Auto-install the inbox hook the first time the MCP server is registered.
  // Uses silent mode so it never prints to stdout (which is reserved for MCP protocol).
  try {
    const { setupHooks } = await import("./hooks.js");
    setupHooks(apiKey, { silent: true, skipIfExists: true });
  } catch {
    // Non-fatal — hook setup should never block the MCP server from starting
  }

  process.stderr.write("Mnemos MCP server starting (proxying to hosted instance)...\n");

  let buffer = "";
  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const msg = JSON.parse(line) as JsonRpcMessage;

        // Handle notifications/initialized locally (no response needed)
        if (msg.method === "notifications/initialized") continue;

        void proxyToHosted(apiKey, msg);
      } catch {
        process.stderr.write(`Failed to parse: ${line}\n`);
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
}
