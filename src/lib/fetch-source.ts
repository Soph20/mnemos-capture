/**
 * Server-side source fetching for capture.
 *
 * When a user pastes a bare URL, the LLM has no internet access at inference
 * time — it can only recall from training data. That risks fabricated or stale
 * insights (garbage written into a *knowledge* repo) and slow speculative calls
 * that trip the serverless/Safari timeout as a silent "Load failed". Fetching
 * the live page on the server first lets the model reason over real extracted
 * text instead of guessing.
 *
 * Best-effort by design: any failure (timeout, non-HTML, bot challenge, blocked
 * host, too little content) returns `null`, and the caller falls back to
 * URL-only mode (passing the raw URL string to the LLM).
 */

import { MAX_INPUT_CHARS } from "./llm";

const FETCH_TIMEOUT_MS = 8000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; MnemosCapture/1.0; +https://github.com/Soph20/mnemos-capture)";
/** Below this, the extracted text is treated as noise (nav-only page, error wall). */
const MIN_USABLE_CHARS = 200;

/** True when the entire input is a single bare URL (no surrounding prose). */
export function isBareUrl(content: string): boolean {
  return /^https?:\/\/\S+$/.test(content.trim());
}

/**
 * Block obviously-internal hosts to limit SSRF on user-supplied URLs. Covers
 * loopback, private ranges, and link-local (incl. the cloud metadata endpoint
 * 169.254.169.254) as IP literals / `localhost`.
 *
 * Limitation: this does NOT resolve DNS, so a public hostname that resolves to
 * a private IP — or a public URL that redirects to one — is not caught. That's
 * an accepted residual risk for a tool where users paste their own public
 * article URLs into their own repo.
 */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

  if (host === "localhost" || host.endsWith(".localhost")) return true;

  if (host.includes(":")) {
    // IPv6 literal
    if (host === "::1") return true; // loopback
    if (host.startsWith("fc") || host.startsWith("fd")) return true; // unique local fc00::/7
    if (host.startsWith("fe80")) return true; // link-local
    return false;
  }

  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true; // this-host / loopback / private
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 192 && b === 168) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
  }

  return false;
}

/**
 * Detect Cloudflare / generic bot-challenge interstitials that are served with
 * status 200 OK in place of the real article. `res.ok === true` does not mean
 * the body is usable — see the "Bot-challenge pages" note in CLAUDE.md.
 */
export function isChallengePage(html: string): boolean {
  const h = html.toLowerCase();
  if (h.includes("cf-browser-verification") || h.includes("cf_chl_") || h.includes("cf-chl-")) {
    return true;
  }
  if (h.includes("just a moment") && h.includes("cloudflare")) return true;
  if (h.includes("enable javascript and cookies to continue")) return true;
  return false;
}

const ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
};

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;|&apos;/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, n: string) => safeFromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => safeFromCodePoint(parseInt(n, 16)));
}

function safeFromCodePoint(code: number): string {
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/**
 * Strip HTML down to readable text.
 *
 * Uses *separate* passes for `<script>` and `<style>` rather than one combined
 * backreference regex: embedded strings like `"</script>"` inside JavaScript
 * make a lazy combined regex stop early and leak code into the output (the bug
 * documented in CLAUDE.md).
 */
export function htmlToText(html: string): string {
  let text = html;
  text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ");
  text = text.replace(/<(nav|header|footer|aside|form|noscript|svg|iframe)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ");
  text = text.replace(/<!--[\s\S]*?-->/g, " ");
  text = text.replace(/<[^>]+>/g, " "); // any remaining tags
  text = decodeEntities(text);
  text = text.replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Fetch a URL and return cleaned article text, or `null` if it can't be used.
 * Never throws — failures resolve to `null` so the caller can fall back to
 * URL-only capture.
 */
export async function fetchSourceContent(url: string): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (isBlockedHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml,text/plain",
      },
    });
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("html") && !contentType.includes("text/")) return null;

    const html = await res.text();
    if (isChallengePage(html)) return null;

    const text = htmlToText(html);
    if (text.length < MIN_USABLE_CHARS) return null;

    return text.slice(0, MAX_INPUT_CHARS);
  } catch {
    return null; // timeout / abort / DNS failure / network error
  } finally {
    clearTimeout(timer);
  }
}
