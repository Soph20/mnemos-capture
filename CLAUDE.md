# Mnemos Capture — Engineering Notes

## Debugging learnings

### "The string did not match the expected pattern."
**IMPORTANT: This phrase has two completely different sources. Do not assume it's always a Safari error.**

**Source A — Safari/WebKit `JSON.parse()` SyntaxError:** Occurs in the *browser* when `res.json()` receives HTML instead of JSON. Chrome shows `"Unexpected token '<'"` for the same bug. The error comes from the browser engine, not the app.

**Source B — GitHub API 422 Unprocessable Entity:** Occurs on the *server* when a `PUT /repos/.../contents/...` request fails GitHub's validation. GitHub returns `{"message":"The string did not match the expected pattern.","documentation_url":"..."}` as a proper JSON error. The app correctly propagates it as `{ error: "GitHub PUT ...: HTTP 422 — {\"message\":\"The string did not match the expected pattern.\"}" }`.

The user sees the same phrase in both cases. Source B was repeatedly misdiagnosed as Source A.

---

**Triggers for Source A (Safari JSON parse) found in this project:**

1. **Server route throwing uncaught exception** → Next.js returns HTML 500 page → client calls `res.json()` on HTML.
   - Fix: wrap the entire route handler body in `try/catch` so the route always returns JSON.

2. **Auth cookie expired → middleware redirect to `/login` HTML** → `fetch()` follows the 307, receives `200 OK` HTML from the login page → `res.ok` is `true` so the error branch is skipped → unguarded success-path `res.json()` throws.
   - Fix: middleware returns `401 { error: "Unauthorized" }` for `/api/*` routes instead of redirecting. Client handles `401` by doing `window.location.href = "/login"`.

3. **`req.json()` outside try-catch** → if body parsing fails for any reason, the route crashes and Next.js returns HTML.
   - Fix: wrap `req.json()` in its own try-catch at the top of the handler.

**Triggers for Source B (GitHub API 422) found in this project:**

4. **Slug containing non-ASCII or special characters** → Cloudflare-protected URLs (e.g. `claude.com`) return a JS bot-challenge page when fetched server-side. After HTML stripping, the extracted "content" is garbage challenge text. Claude generates a slug from it that may contain em-dashes, accented letters, or other characters outside `[a-z0-9-]`. These characters end up in the GitHub API file-path URL, which GitHub rejects with 422.
   - Fix: sanitize the slug before use: `.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled"`.

**Rule:** API routes must always return JSON. Never redirect an API route to an HTML page. Redirects are for browser navigation; JSON errors are for API clients.

**Rule:** When the same error string can come from multiple sources (browser engine AND external API), diagnose by checking: is the server returning HTML (Source A) or is it returning `{ error: "..." }` JSON that happens to contain the phrase (Source B)?

---

### "Load failed" (Safari)
**What it is:** Safari's `TypeError` when a `fetch()` connection is dropped at the TCP level — not an HTTP error. No response ever arrives; the connection is terminated.

**Cause in this project:** User pasted a bare URL as capture content. Claude has no internet access. When given only a URL, Claude must speculate from training data, which is slow and sometimes causes the Anthropic API call to exceed the serverless function timeout or Safari's request timeout. The connection is killed → `fetch("/api/capture")` throws `TypeError: Load failed`.

**Important nuance:** Claude CAN produce insights from a bare URL when it has memorized that page from training data (pre-August 2025 crawl). This made the bug intermittent — worked for well-known pages, failed silently for obscure or recently published ones.

**Fix:** Detect bare URL input server-side (`/^https?:\/\/\S+$/`), fetch the live page content (8s timeout), strip HTML noise (`<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`), truncate to 15k chars, and prepend `Source URL: ...` before passing to Claude. Falls back silently to the raw URL string if the fetch fails.

**Rule:** Never let an LLM compensate for missing input. If the model has no real content to reason over, it produces slow/speculative responses that can cause timeouts before any HTTP error reaches the client. Fetch early, on the server, before the LLM call.

---

### General patterns

- Always guard `res.json()` in **both** the error path (`!res.ok`) and the success path (`res.ok`). A non-JSON body can arrive in either case (redirect, timeout, upstream crash).
- Safari surfaces browser-engine-specific error messages (`"The string did not match the expected pattern."`, `"Load failed"`) that look like app errors but are actually low-level JS engine messages. When a user reports a cryptic one-liner with no stack trace, suspect a failed `res.json()` or a dropped `fetch()` connection first.
- Serverless function timeouts are silent from the client's perspective — the connection drops, not an HTTP 500. Instrument long-running operations (LLM calls, external fetches) with explicit timeouts and fallbacks so failures are surfaced as proper JSON errors rather than dropped connections.
