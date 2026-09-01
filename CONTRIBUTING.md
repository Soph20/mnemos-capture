# Contributing to mnemos

Thanks for looking. mnemos is a small project with a large surface — an MCP server, a Next.js app, a
CLI, and OAuth — so this page is about how to change it safely rather than about process ceremony.

## Before you start

Open an issue first for anything beyond a bug fix or a doc correction. mnemos holds people's GitHub
tokens and LLM API keys, so changes near auth, storage, or the MCP surface deserve a conversation
before the code exists.

Small, obviously-correct fixes — a typo, a broken link, a failing edge case with a test — go straight
to a PR.

## Getting it running

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


## The checks

CI runs exactly two things, and so should you before pushing:

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
```

`npm run test:e2e` runs the Playwright suite; it is not in CI and is optional.

A green Vercel preview means the app *built*. It does not mean the code is correct — that is what the
two commands above are for.

## What good looks like here

**Comments explain why, not what.** The codebase leans on this heavily, especially around security
decisions. If a reader would reasonably ask "why is it done this way?", answer it in the code.

**Pure logic goes in `src/lib/` and gets unit-tested.** Route handlers are hard to test, so the
testable part is extracted — see `paginate`, `matchIndexRows`, `verifyPin`, `encodeRepoPath`. Follow
that pattern rather than adding logic inside a route.

**API routes must always return JSON.** Never let an exception escape a handler: Next.js answers with
an HTML error page, and the client's `res.json()` then fails with a cryptic browser-engine error.
`req.json()` belongs inside its own try/catch — enforced by `route-json-guards.test.ts`.

**Tag errors with their source.** `[capture] ...`, `[auth] ...`. An error string with no origin turns
every future fix into a guess. [CLAUDE.md](CLAUDE.md) explains what that cost the project once
already.

**Read [CLAUDE.md](CLAUDE.md)** before debugging anything strange. It is the accumulated record of
bugs that were misdiagnosed and why — bot-challenge pages, dropped connections, error strings with
two different sources.

## Pull requests

- Branch from `main`.
- One concern per PR. Security fixes especially: reviewable beats comprehensive.
- Say what breaks. If a change invalidates sessions, forces re-auth, or needs `init-db` re-run, put it
  in the PR body — that is the part a reviewer cannot infer from the diff.
- Add a test when you fix a bug. If the bug could return, something should fail when it does.

## Security issues

Do not open a public issue for a vulnerability. Report it privately through
[GitHub Security Advisories](https://github.com/Soph20/mnemos-capture/security/advisories/new).

## Self-hosting

mnemos is MIT licensed, so you may run your own instance. It is not a supported path and there is no
deployment guide: a self-hosted copy does not receive the security fixes made here, and this project
has shipped several that matter. The hosted instance at
[mnemos-capture.vercel.app](https://mnemos-capture.vercel.app) is the maintained way to use it.

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

