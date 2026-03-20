# Mnemos Capture — Engineering Notes

## Debugging learnings

### "The string did not match the expected pattern." (Safari)
**What it is:** Safari/WebKit's `SyntaxError` when `JSON.parse()` receives HTML instead of JSON.
**Not** a validation error, not a GitHub API error — it's a browser-engine-specific JSON parse failure message. Chrome shows `"Unexpected token '<'"` for the same bug.

**Two triggers found in this project:**

1. **Server route throwing uncaught exception** → Next.js returns HTML 500 page → client calls `res.json()` on HTML.
   - Fix: wrap the entire route handler body in `try/catch` so the route always returns JSON.

2. **Auth cookie expired → middleware redirect to `/login` HTML** → `fetch()` follows the 307, receives `200 OK` HTML from the login page → `res.ok` is `true` so the error branch is skipped → unguarded success-path `res.json()` throws.
   - Fix: middleware returns `401 { error: "Unauthorized" }` for `/api/*` routes instead of redirecting. Client handles `401` by doing `window.location.href = "/login"`.

**Rule:** API routes must always return JSON. Never redirect an API route to an HTML page. Redirects are for browser navigation; JSON errors are for API clients.

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
