<div align="center">
  <br>
  <a href="https://mnemos-capture.vercel.app">
    <img src="public/mnemos-hero-light.mp4#gh-light-mode-only" width="220" alt="mnemos">
    <img src="public/mnemos-hero-dark.mp4#gh-dark-mode-only" width="220" alt="mnemos">
  </a>
  <h1>mnemos</h1>
  <p><strong>Turn what you discover into context your AI agents can use.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/mnemos-capture"><img src="https://img.shields.io/npm/v/mnemos-capture?color=1c74d8&labelColor=000820&style=flat" alt="npm" /></a>
    <img src="https://img.shields.io/badge/MCP-compatible-9dd8f5?labelColor=000820&style=flat" alt="MCP" />
    <img src="https://img.shields.io/badge/license-MIT-f0f4f8?labelColor=000820&style=flat" alt="MIT" />
  </p>
</div>

<p align="center">
  <sub>
    <a href="#start-here">Start</a>
    · <a href="#connect-your-ai-coding-agents">Connect</a>
    · <a href="#workflow">Workflow</a>
    · <a href="#mcp-tools">Tools</a>
    · <a href="#your-context-stays-in-github">Security</a>
  </sub>
</p>

---

## Why mnemos?

The problem isn't finding information. It's putting what you learn to work.

Your agents only know what they were trained on, what's in the current prompt, and what's in the repo you opened. They don't know the article you read this morning, the decision you made last sprint, or the pattern that finally worked.

You find useful stuff. mnemos makes sure your AI agents can use it later by turning it into structured .md, stores it in a GitHub repo you own, and makes it available to the AI coding agents you already use.

---

## Start here

You do not need a terminal to start.

### 1. Create your account

Open **[mnemos-capture.vercel.app](https://mnemos-capture.vercel.app)** and sign in with GitHub.

mnemos will:

1. Create a **private** GitHub repo for your knowledge (you can opt to make it public)
2. Ask for your LLM provider API key — Anthropic, OpenAI, or Google. Your key, your cost.
3. Let you set a PIN (6+ characters) for quick unlock on this device
4. Show your **mnemos API key** once — save it if you want to connect a coding tool

That's the whole setup. No repo to clone. No database. No CLI required.

### 2. Capture something

In the app, paste a URL, a note, a doc excerpt, a transcript, or an idea, then hit **Capture**.

mnemos extracts the **core idea**, **key takeaways**, **where to apply it**, and the **capture type**, then commits Markdown to your GitHub repo.

On a phone: open the app → **Share → Add to Home Screen**. It runs like a native app.

### 3. Connect the AI coding agents you already use

Same knowledge, same tools, whichever path you pick.

| If you use | Do this | You need |
| --- | --- | --- |
| **Claude, ChatGPT, or Grok** | Paste the same MCP URL as a custom connector. No terminal. | The URL below |
| **Claude Code, Cursor, Codex, Gemini CLI, VS Code** | The same URL, or one local command | The URL, or your API key |
| **Just the mnemos app for now** | Skip this step. Capture today, connect an AI later. | Nothing else |

---

## Connect your AI coding agents

MCP is how AI tools talk to mnemos. You connect once. After that, Claude, ChatGPT, Grok, and your coding agents can all use the same knowledge.

### One URL. Every chat app.

Claude, ChatGPT, and Grok all take a **custom connector**. Same paste, same sign-in.

```text
https://mnemos-capture.vercel.app/api/mcp
```

1. Open **Connectors** in the app
2. Add a custom connector named `mnemos`
3. Paste the URL
4. Sign in with GitHub when asked

| App | Open this |
| --- | --- |
| **Claude** | Settings → Connectors → Add custom connector |
| **ChatGPT** | Settings → Connectors (turn on Developer Mode first) |
| **Grok** | [grok.com/connectors](https://grok.com/connectors) → New Connector → Custom |

Finish mnemos onboarding (knowledge repo + LLM key) before connecting. Then ask: *list my inbox* or *brief me*.

Any other chat app with custom MCP connectors uses this same URL.

### AI coding agents

Cursor, Codex, Claude Code, Gemini CLI, VS Code, Windsurf, Cline, Zed, Claude Desktop — if the tool can launch a local process, register this command:

```bash
npx -y mnemos-capture@latest serve-mcp --key YOUR_API_KEY
```

```json
{
  "mcpServers": {
    "mnemos": {
      "command": "npx",
      "args": ["-y", "mnemos-capture@latest", "serve-mcp", "--key", "YOUR_API_KEY"]
    }
  }
}
```

**Claude Desktop:** Settings → Developer → Edit Config, add the block to `claude_desktop_config.json`, then fully restart Claude Desktop.

Claude Code can skip the key and use the same URL as the chat apps:

```bash
claude mcp add --transport http mnemos https://mnemos-capture.vercel.app/api/mcp
```

Use the URL when the client supports remote MCP. Use the command when it can launch a local process. If the tool has no MCP support yet, capture in the [mnemos app](https://mnemos-capture.vercel.app) and connect later.

---

## Workflow

<p align="center">
  <img src="public/flow-workflow.svg" width="720" alt="Docs and notes → Capture → GitHub Markdown → Brief → Plan → Execute → Mark applied" />
</p>


### 1. Capture

Paste anything text-based: papers, docs, posts, GitHub repos, notes, decisions, ideas, transcripts.

mnemos detects whether you pasted a URL, a short note, or longer text. No manual tagging required.

From a connected agent:

```text
capture "The Mom Test: don't ask if your idea is good. Ask about the person's real behavior, current workflow, and past spending."
```

### 2. Brief

At the start of a work session, ask your agent for a briefing — or install the Claude Code hook below.

mnemos looks at your project (branch, recent commits, `CLAUDE.md`, repo context) and ranks captures that could help now: **why** it matters, **what** applying it could achieve, **where** it could land. You decide what to apply.

### 3. Plan

Select the captures you want and ask your agent to call `generate_plan`. Each plan is Markdown:

- **Codebase mapping** — files and components involved
- **Implementation steps** with effort tiers: `simple`, `complex`, `architectural`
- **Verification checklist** — what to run when the work is done

### 4. Execute

Hand the plan to your agent in the current session, or run it in an isolated git worktree:

```bash
npx -y mnemos-capture@latest config set agent "claude -p"
npx -y mnemos-capture@latest kos --key YOUR_API_KEY
```

`kos` creates a worktree, loads the plan as the contract, launches the assistant you configured, and prints the verification checklist when it finishes.

```bash
npx -y mnemos-capture@latest config set agent "codex exec"
```

---

## Example capture

```text
The Mom Test: don't ask if your idea is good. Ask about the person's real behavior, current workflow, and past spending.
```

```markdown
---
date: 2026-06-05
source: The Mom Test note
type: note
tags: customer-discovery, product, research
status: inbox
---

# The Mom Test

## Core idea

Do not ask people to judge your idea. Ask about their real life,
recent behavior, current workaround, and what they have already
tried or paid for.

## Key takeaways

- Avoid compliments and future promises
- Ask about specific past behavior
- Look for existing pain, workarounds, and spending

## Where to apply

Discovery interview scripts, landing page tests, and product
validation prompts.
```

Plain Markdown in a repo you own. Readable, editable, versioned, portable.

---

## MCP tools

You don't have to memorize these. Ask in plain language: "save this", "what do I have on payments?", "brief me for this repo".

| Tool | What it does |
| --- | --- |
| `capture` | Save new knowledge from pasted text or a URL |
| `list_inbox` | List captures waiting for review |
| `search_captures` | Keyword search across your captures |
| `read_capture` | Read a capture in full |
| `recall` | Find relevant context from a description of your task |
| `briefing` | Get project-specific recommendations |
| `generate_plan` | Turn selected captures into an implementation plan |
| `list_plans` | List or read saved plans |
| `apply_capture` | Mark a capture as applied |
| `archive_capture` | Archive a capture |
| `delete_capture` | Delete a capture |
| `apply_to_context` | Get file-level suggestions for the current task |
| `synthesize` | Combine related captures into reusable rules |
| `get_rules` | Retrieve those rules |
| `curate` | Review and clean up captures |
| `vault_scan` | Find relevant context for what you're about to edit |

---

## Claude Code hooks

Optional. MCP works without them.

| Mode | Command |
| --- | --- |
| Session briefing | `npx -y mnemos-capture@latest setup-hooks --key YOUR_API_KEY --briefing` |
| Vault, as you edit | `npx -y mnemos-capture@latest setup-hooks --key YOUR_API_KEY --vault` |
| Both | `npx -y mnemos-capture@latest setup-hooks --key YOUR_API_KEY --briefing --vault` |

| Surface | Hooks |
| --- | --- |
| Claude Code CLI, VS Code / JetBrains extensions, desktop app | Yes |
| Claude Code on the web | No — hooks are local files |
| Cursor and other MCP clients | No — different hook systems |

If hooks aren't available, tell your agent: *At session start, call `list_inbox` or `briefing`.*

---

## CLI

No global install required.

```bash
npx -y mnemos-capture@latest <command>
```

| Command | What it does |
| --- | --- |
| `npx -y mnemos-capture@latest` | Open the hosted app |
| `serve-mcp --key YOUR_API_KEY` | Run the local MCP proxy |
| `setup-hooks --key YOUR_API_KEY [--briefing] [--vault]` | Install Claude Code hooks |
| `config set agent "claude -p"` | Set which assistant `kos` should drive |
| `kos --key YOUR_API_KEY` | Implement the latest plan in an isolated worktree |
| `inbox-check --key YOUR_API_KEY [--briefing]` | Debug the session hook |
| `vault-check --key YOUR_API_KEY` | Debug the vault hook |
| `help` | Show help |

---

## Your context stays in GitHub

Captures live as structured Markdown in **your** GitHub repository. Private by default.

- **No lock-in** — clone it, move it, delete mnemos, keep the files
- **No proprietary format** — every capture is a readable `.md` file
- **No training on your data** — captures are sent only to the LLM provider you chose, with the key you supplied, to extract the insight you asked for
- **Any tool can read it** — anything that reads Git or speaks MCP
- **BYOK** — your provider, your key, your cost
- **Never commit your mnemos API key** to source control

## What mnemos stores, and where

The whole point of this repo being public is that you can check these claims rather than trust them.

**Your captures are never stored by mnemos.** They are written straight to your own GitHub repo as Markdown (`src/lib/github.ts`). There is no captures table. Delete the app and your knowledge is untouched.

**The database holds only account plumbing** (`src/lib/db.ts`):

| Stored | What it is |
| --- | --- |
| `github_id`, `github_username` | who you are |
| `github_token` | encrypted (`src/lib/crypto.ts`) |
| `github_repo` | the *name* of your hub, not its contents |
| `pin_hash` | salted scrypt (`src/lib/pin.ts`) |
| `api_key` | hashed — not recoverable |
| `llm_provider`, `llm_api_key` | encrypted |
| `token_version` | bumped to revoke everything |
| login attempts, OAuth clients/codes, refresh-token ids | auth plumbing |

When you capture, the server talks to exactly three kinds of destination:

1. **GitHub** — to write the capture into your repo
2. **Your LLM provider**, with *your* key — Anthropic, OpenAI, or Google
3. **The page you captured** — if you paste a bare URL, so the model reads real content. Only http/https, never an internal address

No analytics, no telemetry, no third-party tracking.

### How your credentials are stored

| Secret | How it's stored |
| --- | --- |
| GitHub token | Encrypted at rest (AES-256-GCM). Uses the `repo` scope, required to read and write a **private** knowledge hub |
| Your LLM API key | Encrypted at rest (AES-256-GCM) |
| Your MCP API key | Hashed — never recoverable, not even by mnemos |
| Your PIN | Salted scrypt hash |

Your MCP key is shown exactly once. If you lose it, generate a new one.

**PIN unlock is device-bound.** It only works on a device that has already signed in with GitHub. A PIN on its own is not enough to reach your account.

**Revoking access.** Generating a new MCP key invalidates the old key, every signed-in session, and every connected MCP client. Sessions also expire after 30 days.

---

## Cost

mnemos is BYOK. You bring your own API key. mnemos never charges you for inference.

Extraction runs on a fast, low-cost model (Claude Haiku 4.5 by default):

| Usage | Estimated monthly cost |
| --- | --- |
| 50 captures/month | ~$0.15 |
| 100 captures/month | ~$0.30 |
| 200 captures/month | ~$0.60 |

Briefing, planning, and synthesis only run when you ask for them.

---

## Roadmap

**Shipped** — hosted web + PWA, GitHub-backed Markdown repo, remote MCP connector, local stdio proxy, BYOK (Anthropic, OpenAI, Google), Claude Code hooks, `kos` orchestrator.

**Planned** — Chrome extension, adapters for tools without MCP, voice memo capture, one gateway key across providers, `kos` per-step model switching and `--detach`.

---

## Local development

You do not need to run mnemos to use it — the hosted instance at [mnemos-capture.vercel.app](https://mnemos-capture.vercel.app) is the supported way in. This section is for working on the code.

| | |
| --- | --- |
| Node.js | 20.9 or later (Next.js 16 requires it) |
| PostgreSQL | any reachable instance — local, Neon, or Vercel Postgres |
| GitHub OAuth app | [create one](https://github.com/settings/developers) with callback `http://localhost:3000/api/auth/callback` |

```bash
git clone https://github.com/Soph20/mnemos-capture.git
cd mnemos-capture
npm ci
cp .env.example .env
```

| Variable | Where it comes from |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | your GitHub OAuth app |
| `POSTGRES_URL` | your Postgres connection string |
| `SESSION_SECRET` | `openssl rand -hex 32` — also derives the credential-encryption key |
| `ADMIN_SECRET` | any random string; guards `/api/init-db` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |

```bash
npm run dev
# in another shell, once — creates the tables (idempotent)
curl -X POST http://localhost:3000/api/init-db -H "x-admin-secret: $ADMIN_SECRET"
```

Sign in at `http://localhost:3000` with GitHub. **`init-db` must succeed before sign-in works.**

```bash
MNEMOS_API_URL=http://localhost:3000/api/mcp node dist/cli/index.js serve-mcp --key <key>
```

**After any schema change**, `init-db` must run again. From GitHub: **Actions → Initialize database → Run workflow**.

```bash
npm run typecheck
npm test
npm run test:e2e   # Playwright, optional
```

Contributing? See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript |
| Database | Vercel Postgres |
| Auth | GitHub OAuth · OAuth 2.1 + PKCE for MCP connectors |
| Storage | GitHub Contents API — your captures live in your repo |
| Agent interface | Model Context Protocol (Streamable HTTP + stdio proxy) |
| LLM | Anthropic SDK · OpenAI and Google via REST (BYOK) |
| Styling | Tailwind CSS |
| Tests | Vitest (unit) · Playwright (e2e) |

---

<div align="center">
  <p><a href="https://github.com/Soph20">Sofía Padrón Valdez</a> — builder, AI systems architect.</p>
</div>

```bibtex
@misc{2026mnemos,
  title        = {mnemos: A Knowledge Pipeline for AI Agents},
  author       = {Sofia Padron Valdez},
  year         = 2026,
  journal      = {GitHub repository},
  publisher    = {GitHub},
  howpublished = {\url{https://github.com/Soph20/mnemos-capture}}
}
```

[MIT License](./LICENSE)
