# mnemos-capture

Two things in one deployment:

1. **Capture app** — paste anything (URL, article, notes, transcript). Claude extracts structured insights and writes them to `mnemos-knowledge` on GitHub.
2. **MCP endpoint** — serves the full Lenny Rachitsky knowledge base (305 structured insight files) to any Claude Code session via `https://mnemos-capture.vercel.app/api/mcp`.

**Live at:** https://mnemos-capture.vercel.app

---

## Knowledge store

All captured knowledge lives in a separate repo: [`mnemos-knowledge`](https://github.com/Soph20/mnemos-knowledge)

```
mnemos-knowledge/
├── INDEX.md          ← master index of all captures
├── inbox/            ← new captures (unprocessed)
├── lenny/            ← 305 Lenny podcast insight files + INDEX.md
├── work/
├── career/
├── founder/
└── life/
```

---

## MCP — Lenny knowledge base

Any Claude Code repo can query the Lenny knowledge base by adding to `.mcp.json`:

```json
{
  "mcpServers": {
    "mnemos": {
      "type": "http",
      "url": "https://mnemos-capture.vercel.app/api/mcp"
    }
  }
}
```

**Available tools:**

| Tool | Description |
|---|---|
| `search_lenny` | Keyword search → returns full matching insight files |
| `get_insights` | Fetch full files for specific speakers by name |
| `list_speakers` | Browse all 305 speakers, roles, and topics |

No local setup. Works on any machine.

---

## Capture app

Paste any content → Claude extracts core idea, takeaways, quotes, mode tags → saved to `mnemos-knowledge/inbox/` via GitHub API.

**Mode routing:**
- `work` — telecom, B2B SaaS, campaigns, messaging platforms
- `career` — PM craft, product frameworks, interviews, job search
- `founder` — AI-native products, startup, B2B ops, 0-to-1
- `life` — well-being, habits, books, mental health, energy, ADHD

---

## Environment variables

Set these in Vercel (or `.env.local` for local dev):

```
ANTHROPIC_API_KEY=sk-ant-...       # Claude API key
GITHUB_TOKEN=ghp_...               # Personal access token (repo scope)
GITHUB_REPO=Soph20/mnemos-knowledge
GITHUB_BRANCH=main
CAPTURE_SECRET=your-pin            # PIN for the capture app UI
MCP_SECRET=                        # Optional — Bearer token for /api/mcp (leave empty = open)
```

---

## Local development

```bash
npm install
cp .env.local.example .env.local   # fill in your values
npm run dev                         # http://localhost:3000
```

---

## How a capture flows

1. Paste URL or text → hit **Capture** (or `⌘↵`)
2. If URL: server fetches and strips the page (Cloudflare-protected pages are skipped)
3. Claude extracts: `slug`, `coreIdea`, `takeaways`, `quotes`, `modes`, `appliedTo`
4. Written to `mnemos-knowledge/inbox/YYYY-MM-DD-{slug}.md`
5. `INDEX.md` updated with a new row
