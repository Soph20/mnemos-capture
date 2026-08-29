# Contributing to Mnemos

Thanks for looking. Mnemos is a small project with a large surface — an MCP server, a Next.js app, a
CLI, and OAuth — so this page is about how to change it safely rather than about process ceremony.

## Before you start

Open an issue first for anything beyond a bug fix or a doc correction. Mnemos holds people's GitHub
tokens and LLM API keys, so changes near auth, storage, or the MCP surface deserve a conversation
before the code exists.

Small, obviously-correct fixes — a typo, a broken link, a failing edge case with a test — go straight
to a PR.

## Getting it running

See [Local development](README.md#local-development) in the README: prerequisites, the five
environment variables, and the one-time `init-db` call. `init-db` must succeed before sign-in works.

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

Mnemos is MIT licensed, so you may run your own instance. It is not a supported path and there is no
deployment guide: a self-hosted copy does not receive the security fixes made here, and this project
has shipped several that matter. The hosted instance at
[mnemos-capture.vercel.app](https://mnemos-capture.vercel.app) is the maintained way to use it.
