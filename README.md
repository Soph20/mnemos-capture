# Mnemos

**Stop saving things you'll never read again.**

Mnemos is a zero-friction knowledge capture tool for people who learn by doing. Paste any resource — article, thread, transcript, research, notes — and Claude extracts the insights, tags them by context, and commits them to your personal knowledge repo. When you're ready to work, your agentic workflows pull from the same repo automatically.

No more bookmarks. No more "I'll read it later." Capture once, apply everywhere.

## How it works

```
You find something valuable
        ↓
Open Mnemos → paste it → hit Capture
        ↓
Claude extracts: core idea, takeaways, quotes, context tags
        ↓
Auto-committed to your GitHub knowledge repo (inbox/)
        ↓
Your Claude Code workflow picks it up and applies it
```

**What Claude extracts from each capture:**
- **Core idea** — the actual insight, not a summary
- **Key takeaways** — specific, opinionated, actionable
- **Quotes** — only genuinely quotable lines
- **Mode tags** — where this applies (career, work, founder, life)
- **Applied to** — one sentence connecting it to something you're doing

## Deploy your own (60 seconds)

### Option A: One-click deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Soph20/mnemos-capture&env=ANTHROPIC_API_KEY,GITHUB_TOKEN,GITHUB_REPO,CAPTURE_SECRET&envDescription=Configuration%20for%20your%20Mnemos%20instance&envLink=https://github.com/Soph20/mnemos-capture%23environment-variables)

Vercel will prompt you for the required environment variables (see below).

### Option B: Run locally

```bash
git clone https://github.com/Soph20/mnemos-capture.git
cd mnemos-capture
cp .env.example .env.local    # then edit with your values
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Your Claude API key. Get one at [console.anthropic.com](https://console.anthropic.com) |
| `GITHUB_TOKEN` | Yes | GitHub Personal Access Token with `repo` scope. [Create one here](https://github.com/settings/tokens/new?scopes=repo&description=mnemos-capture) |
| `GITHUB_REPO` | Yes | Your knowledge repo in `owner/repo` format (e.g., `yourname/mnemos-knowledge`) |
| `CAPTURE_SECRET` | Yes | Any string — used as a PIN to lock your instance |
| `GITHUB_BRANCH` | No | Branch to commit to. Defaults to `main` |

## Set up your knowledge repo

Mnemos writes captures to a GitHub repo you own. You have two options:

**Option A (recommended):** Use the [mnemos-knowledge-template](https://github.com/Soph20/mnemos-knowledge-template) — click "Use this template" to create your repo with the correct structure.

**Option B:** Create any repo. Mnemos will auto-create `INDEX.md` and write captures to `inbox/` on first use.

### Repo structure

```
your-knowledge-repo/
├── INDEX.md           ← Master index (auto-maintained)
├── inbox/             ← Unprocessed captures land here
├── career/            ← Processed: career-related insights
├── work/              ← Processed: work-related insights
├── founder/           ← Processed: founder-related insights
└── life/              ← Processed: life-related insights
```

## Mobile access

Mnemos is a PWA — add it to your home screen on iPhone/iPad for app-like access.

**Same network:**
1. Find your Mac's local IP (`System Settings → Wi-Fi → Details`)
2. Open `http://[your-ip]:3000` in Safari
3. Share → Add to Home Screen

**Remote access (free, no account):**
```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared tunnel --url http://localhost:3000
```

## Connect to your Claude Code workflow

Mnemos captures knowledge. To apply it, connect your knowledge repo to Claude Code:

**1. Add Mnemos as an MCP source** in your `.mcp.json`:
```json
{
  "mnemos": {
    "type": "http",
    "url": "https://your-mnemos-instance.vercel.app/api/mcp"
  }
}
```

**2. Process captures** — in any Claude Code session, say:
```
process inbox
```

Claude reads your knowledge repo's `inbox/`, extracts insights relevant to your current workflow, and moves processed captures to the appropriate mode folder.

## Tech stack

- **Next.js 15** (App Router, server components)
- **Anthropic SDK** (Claude Sonnet for extraction)
- **GitHub API** (storage — no database needed)
- **TypeScript** (strict mode)
- **Tailwind CSS** (dark/light themes)

## Why GitHub as storage?

No database to provision. No vendor lock-in. Your knowledge is version-controlled, portable, and readable as plain Markdown. Clone it, search it, back it up — it's just files in a repo you own.

## Roadmap

- [ ] GitHub OAuth (eliminate PAT setup)
- [ ] First-run setup wizard in the app
- [ ] Claude Code plugin for one-command install
- [ ] Batch capture (multiple URLs at once)
- [ ] Search across your knowledge hub

## License

MIT — see [LICENSE](LICENSE)
