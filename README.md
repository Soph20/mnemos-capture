# Mnemos

**Stop saving things you'll never apply.**

Mnemos is a knowledge capture tool for builders who use AI agents. Paste any resource — article, thread, transcript, notes — and an LLM extracts the insight, tags where it applies, and stores it in a GitHub repo you own. Your AI tools (Claude Code, or any MCP-compatible agent) can then pull from that repo directly.

Every capture has an **"Applied to"** field — a concrete connection between what you learned and what you're building. Knowledge doesn't sit in a saved-for-later graveyard. It feeds your workflows.

## Get started

### 1. Sign up (30 seconds)

Go to **[mnemos-capture.vercel.app](https://mnemos-capture.vercel.app)** → **Sign in with GitHub**.

During setup, Mnemos:
- Creates a knowledge repo in your GitHub account (you own it, it's just Markdown files)
- Asks for your Anthropic API key (your key, stored in the database — Mnemos never pays for your API calls)
- Sets a PIN for quick mobile access

No config files. No CLI setup. No cloning repos.

### 2. Capture something

Open the app on any device (phone, tablet, desktop), paste content, hit **Capture**. That's it.

**What the LLM extracts from each capture:**
- **Core idea** — the actual insight, not a summary
- **Key takeaways** — specific, opinionated, actionable
- **Quotes** — only genuinely quotable lines
- **Mode tags** — where this applies (career, work, founder, life)
- **Applied to** — one sentence connecting this to something you're building right now

The result is auto-committed to your GitHub knowledge repo as a Markdown file.

### 3. Connect to Claude Code (optional)

After signing up, you get an API key. This lets you connect Mnemos to Claude Code so your agent can capture and search knowledge without leaving the terminal.

Run this once in your terminal:

```bash
claude mcp add mnemos -- npx mnemos-capture serve-mcp --key <your-api-key>
```

This installs a small bridge that connects Claude Code to the hosted Mnemos app. Now you can say things like:
- *"Capture this article about prompt caching"*
- *"What's in my inbox?"*
- *"Search my captures for evaluation frameworks"*

> **What's happening under the hood:** `npx mnemos-capture serve-mcp` runs a lightweight local process that translates between Claude Code's stdio protocol and the Mnemos HTTP API. Your API key authenticates the requests. No data is stored locally — everything goes to your GitHub repo via the hosted app.

## How it works

```
You find something valuable
        ↓
Open Mnemos → paste it → hit Capture
        ↓
LLM extracts: core idea · takeaways · quotes · context tags · applied to
        ↓
Structured Markdown committed to your GitHub knowledge repo
        ↓
Your AI tools pull from it via MCP or by reading the repo directly
```

## Mobile access

Mnemos is a PWA (Progressive Web App). On your phone: open the app URL in Safari or Chrome → Share → **Add to Home Screen**. It looks and feels like a native app — instant capture from anywhere.

## Why GitHub as storage?

Your knowledge lives in a repo you own. No proprietary database, no vendor lock-in. It's version-controlled, portable, and readable as plain Markdown. Clone it, search it with `grep`, back it up — it's just files. And because it's a standard Git repo, any MCP-compatible agent or tool can read from it.

## Tech stack

Next.js · TypeScript (strict) · Anthropic SDK · GitHub OAuth · Vercel Postgres (Neon) · GitHub API · MCP protocol · Tailwind CSS

## Roadmap

- [ ] Multi-provider support (OpenAI, Google — schema is ready, extraction code needs updating)
- [ ] Batch capture (multiple resources at once)
- [ ] URL auto-fetch (paste a link, Mnemos fetches the content)
- [ ] Full-text search across knowledge hub
- [ ] Browser extension for one-click capture
- [ ] Settings page (change API key, repo, regenerate MCP key)
- [ ] Team knowledge hubs (shared captures)

## License

[MIT](LICENSE)
