// MCP server that runs locally via stdio and proxies to the hosted Mnemos API.
// Used by Claude Code: claude mcp add mnemos -- npx mnemos serve-mcp --key <api-key>

const HOSTED_URL = "https://mnemos-capture.vercel.app/api/mcp";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: string | number;
  method?: string;
  params?: Record<string, unknown>;
}

function sendMessage(msg: Record<string, unknown>): void {
  const json = JSON.stringify(msg);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
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
    process.stderr.write("Usage: npx mnemos serve-mcp --key <your-api-key>\n\n");
    process.stderr.write("Get your API key at: https://mnemos-capture.vercel.app/onboard\n\n");
    process.exit(1);
  }

  process.stderr.write("Mnemos MCP server starting (proxying to hosted instance)...\n");

  let buffer = "";
  process.stdin.setEncoding("utf-8");

  process.stdin.on("data", (chunk: string) => {
    buffer += chunk;

    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const header = buffer.slice(0, headerEnd);
      const match = header.match(/Content-Length:\s*(\d+)/i);
      if (!match) {
        buffer = buffer.slice(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(match[1] as string, 10);
      const bodyStart = headerEnd + 4;

      if (buffer.length < bodyStart + contentLength) break;

      const body = buffer.slice(bodyStart, bodyStart + contentLength);
      buffer = buffer.slice(bodyStart + contentLength);

      try {
        const msg = JSON.parse(body) as JsonRpcMessage;

        // Handle notifications/initialized locally (no response needed)
        if (msg.method === "notifications/initialized") continue;

        void proxyToHosted(apiKey, msg);
      } catch {
        process.stderr.write(`Failed to parse: ${body}\n`);
      }
    }
  });

  process.stdin.on("end", () => process.exit(0));
}
