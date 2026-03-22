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

4. **Slug containing non-ASCII or special characters** → slug ends up in the GitHub API file-path URL, which GitHub rejects with 422 if the path is malformed.
   - Fix: sanitize the slug before use: `.replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "untitled"`.

---

### Bot-challenge pages (Cloudflare) silently corrupting captured content

**What it is:** When fetching a Cloudflare-protected URL server-side (e.g. `claude.com`), Cloudflare returns a **bot-challenge page** with status `200 OK` — not the real article. The page contains JavaScript challenge code and phrases like "Just a moment... Enable JavaScript and cookies to continue."

**Why it's dangerous:** The server sees `pageRes.ok === true` and proceeds to extract text. The extracted text is garbage challenge content (sometimes including JavaScript fragments that the regex doesn't fully strip). This garbage is passed to Claude as the "article content." Claude, trying to extract insights from JavaScript/challenge text, may produce malformed JSON or output that causes downstream failures — including errors that surface as "The string did not match the expected pattern."

**The regex problem:** The original script-stripping regex `/<(script|style|...)[\s\S]*?<\/\1>/gi` uses a lazy quantifier that stops at the **first** closing tag it finds. Cloudflare's JavaScript often contains strings like `"</div>"` or `"</script>"` embedded in the JS code. The lazy regex stops early and leaves JavaScript fragments in the extracted text.

**Fix:**
1. Detect challenge pages before extracting text by checking for known Cloudflare signatures (`cf-browser-verification`, `cf_chl_`, "Just a moment" + "Cloudflare").
2. If a challenge page is detected, skip extraction entirely and fall back to URL-only mode (Claude uses training data).
3. Use separate regex passes for `<script>` and `<style>` instead of a combined backreference regex.

**Rule:** Before using server-fetched HTML content, validate that it's real article content — not a bot challenge, login wall, or error page. `pageRes.ok === true` does not mean the content is usable.

**Rule:** API routes must always return JSON. Never redirect an API route to an HTML page. Redirects are for browser navigation; JSON errors are for API clients.

**Rule:** When the same error string can come from multiple sources (browser engine AND external API), diagnose by checking: is the server returning HTML (Source A) or is it returning `{ error: "..." }` JSON that happens to contain the phrase (Source B)?

---

### Debugging process failure: pattern-matching on error strings instead of tracing code paths

**The mistake:** When the same error recurred across multiple fix attempts, each diagnosis was made by asking "what throws this string?" rather than "what code path is the request actually taking right now?" Those are different questions. The first produces a list of plausible causes. The second requires knowing the actual execution path.

**How it played out:** "The string did not match the expected pattern." appeared repeatedly. Each fix targeted a plausible-sounding cause (server crash → HTML response, middleware redirect, GitHub API slug validation) without verifying that the proposed mechanism was actually possible. The slug sanitization fix was wrong because `Buffer.from(content, "utf-8").toString("base64")` always produces valid base64 — a non-ASCII slug cannot cause GitHub to return that error. The story fit the surface facts but the mechanism was never checked.

**The root cause of repeated misdiagnosis:** Every catch block returned `err.message` with no context about where the error came from. "The string did not match the expected pattern." looks identical whether it came from Safari's JSON engine, the GitHub API, or the Anthropic SDK. An opaque error message makes every fix a guess.

**The fix that should have come first:** Before changing any logic, add source context to error responses:
```typescript
// Instead of:
return NextResponse.json({ error: message }, { status: 500 });

// Add where it came from:
return NextResponse.json({ error: `[github-write] ${message}` }, { status: 500 });
```
This alone would have immediately shown whether the error was coming from the GitHub write step, the Anthropic call, or the JSON parse — and every subsequent fix would have been targeted rather than speculative.

**Rule:** When an error recurs across multiple fixes, the problem is not the fix — it's that the error message doesn't contain enough information to identify its source. Fix observability first, then fix the error.

**Rule:** Before proposing a fix, verify the mechanism: could the proposed cause actually produce this error given the code? If the answer requires assumptions you can't verify, add logging before writing any fix.

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
