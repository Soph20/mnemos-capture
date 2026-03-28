# Mnemos

**Stop saving things you'll never apply.**

Mnemos is a knowledge pipeline for builders who work with AI agents. Paste any resource — article, thread, transcript, notes — and Claude extracts the insight, tags where it applies, and routes it to your agentic workflows. Your Claude Code session (or any MCP-compatible tool) pulls from it directly.

The knowledge doesn't sit in a saved-for-later graveyard. It gets applied.

That's why every capture has an "Applied to" field — a concrete connection between what you just read and what you're actually building. When your agents run on Monday morning, they pull from the same knowledge hub automatically.

## Get started

### 1. Sign up (30 seconds)

Go to **[mnemos-capture.vercel.app](https://mnemos-capture.vercel.app)** → Sign in with GitHub.

Mnemos creates your knowledge repo, you add your Anthropic API key, set a PIN, and you're capturing. No config files to edit.

### 2. Connect to Claude Code

After signing up, you'll get an API key. Run this once:

```bash
claude mcp add mnemos -- npx mnemos serve-mcp --key <your-api-key>
```

Now Claude Code can capture and search your knowledge directly:

- *"Capture this article about prompt caching"*
- *"What's in my inbox?"*
- *"Search my captures for evaluation frameworks"*

## How it works

```
You find something valuable
        ↓
Open Mnemos (phone, tablet, desktop) → paste it → hit Capture
        ↓
Claude extracts: core idea · takeaways · quotes · context tags · applied to
        ↓
Auto-committed to your GitHub knowledge repo
        ↓
Your agentic workflows pull from it via MCP
```

**What Claude extracts from each capture:**

- **Core idea** — the actual insight, not a summary
- **Key takeaways** — specific, opinionated, actionable
- **Quotes** — only genuinely quotable lines
- **Mode tags** — where this applies (career, work, founder, life)
- **Applied to** — one sentence connecting this to something you're building right now

## Mobile access

Mnemos is a PWA. On your phone: open the app URL in Safari → Share → Add to Home Screen. Full native-app feel, instant capture from anywhere.

## Why GitHub as storage?

No database for your content. No vendor lock-in. Your knowledge is version-controlled, portable, and readable as plain Markdown. Clone it, search it, back it up — it's just files in a repo you own. And because it's Git, any MCP-compatible agent can read it.

## Self-hosting

Want to run your own instance? Clone the repo and deploy to Vercel:

```bash
git clone https://github.com/Soph20/mnemos-capture.git
cd mnemos-capture
npm install
```

See [`.env.example`](.env.example) for required environment variables.

## Tech stack

Next.js 15 · TypeScript (strict) · Anthropic SDK · GitHub OAuth · Vercel Postgres · GitHub API · MCP protocol · Tailwind CSS

## Roadmap

- [ ] Batch capture (multiple URLs at once)
- [ ] Full-text search across knowledge hub
- [ ] Browser extension for one-click capture
- [ ] Process inbox command from Claude Code
- [ ] Team knowledge hubs (shared captures)

## License

[MIT](LICENSE)
