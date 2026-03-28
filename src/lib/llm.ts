/**
 * LLM extraction logic — system prompt, model config, and parsing.
 * Single source of truth for the extraction pipeline.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedCapture } from "./types";

// ── Config ──

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 800;

/** Max input characters sent to the LLM (~1500 tokens, covers 95% of captures). */
export const MAX_INPUT_CHARS = 6000;

// ── System prompt ──

export const SYSTEM_PROMPT = `You are a knowledge extraction engine for a personal PKM system. Process the input and return ONLY valid JSON — no markdown, no text, no wrapping.
{"slug":"3-6-word-hyphenated-core-idea","inferredTitle":"string","inferredAuthor":"string|null","inferredUrl":"string|null","inferredType":"article|blog|research|transcript|notes|post|book|thread|video","coreIdea":"string","takeaways":["string"],"quotes":["string"],"tags":["string"],"appliedTo":"string|null","lowConfidence":false}
RULES
slug: lowercase hyphenated, derive from insight not headline, strip articles
inferredUrl: only if explicit in content, never construct
inferredType: research=citations/methodology; transcript=spoken→text; thread=social/forum chains; video=YT/video; book=excerpt/notes; notes=unstructured personal; post=LinkedIn/Substack/newsletter; blog=long-form editorial; article=journalistic. Ambiguous→format over platform.
coreIdea: 1-2 sentences. "X because Y, therefore Z." Not what the piece covers. Not "this article argues."
takeaways: 3–5 specific opinionated assertions. Must pass "so what?" test. Bad: "Consistency matters." Good: "Consistency compounds only when feedback closes within 24h."
quotes: verbatim only, only if phrasing is irreplaceable. [] if none. Never fabricate.
tags: 2-5 lowercase topic tags relevant to the content (e.g. "product-discovery", "ai-agents", "pricing", "user-research"). Descriptive, not categorical.
appliedTo: one sentence connecting this insight to something the reader could act on right now. null if forced or unclear.
lowConfidence: true if <100 words, URL-only, unprocessable, or coreIdea uncertain.
EDGE CASES: URL-only→extract from path+lowConfidence:true | non-English→return in same language | multiple authors→"A, B" | thread→OP as primary source
EXAMPLE
Input: "The mom test — Rob Fitzpatrick. Don't ask if your idea is good. Ask about their life. 'Would you use this?' measures politeness. Ask: 'Walk me through the last time you dealt with this.' No recent instance = not urgent enough to build."
Output: {"slug":"mom-test-past-behavior-not-validation","inferredTitle":"The Mom Test — Validating Without Leading","inferredAuthor":"Rob Fitzpatrick","inferredUrl":null,"inferredType":"book","coreIdea":"People lie about future behavior to be kind. The only reliable signal is past behavior — so questions must be about their life, not your idea.","takeaways":["'Would you use this?' measures politeness, not demand","Recency is a proxy for urgency — no recent instance means no pressing need","Interviews yield signal only when the subject doesn't know they're evaluating your idea"],"quotes":["Walk me through the last time you dealt with this."],"tags":["product-discovery","user-research","validation","interviews"],"appliedTo":"Structure discovery calls around past failures and workarounds, not hypothetical product interest.","lowConfidence":false}`;

// ── Extraction ──

/** Build the user message from content + optional title hint, with truncation. */
export function buildInput(content: string, title?: string): string {
  const raw = title ? `Title hint: ${title}\n\n${content}` : content;
  return raw.slice(0, MAX_INPUT_CHARS);
}

/** Call the LLM and parse the extraction result. Throws on failure. */
export async function extractCapture(
  apiKey: string,
  content: string,
  title?: string,
): Promise<ExtractedCapture> {
  const client = new Anthropic({ apiKey });
  const input = buildInput(content, title);

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: input }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "";
  const rawJson = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(rawJson) as ExtractedCapture;
  } catch {
    throw new Error("Failed to parse LLM response — extraction returned invalid JSON.");
  }
}

// ── Markdown formatting ──

/** Format today's date as YYYY-MM-DD. */
export function formatDate(): string {
  return new Date().toISOString().split("T")[0] as string;
}

/** Build the full Markdown document for a capture. */
export function buildMarkdown(
  date: string,
  capture: ExtractedCapture,
  rawContent: string,
): string {
  const quotesSection =
    capture.quotes.length > 0
      ? capture.quotes.map((q) => `> "${q}"`).join("\n\n")
      : "_none_";

  const confidenceNote = capture.lowConfidence
    ? "\n> **Low confidence extraction** — input was short or ambiguous. Review before acting on it.\n"
    : "";

  return `---
date: ${date}
source: ${capture.inferredTitle}${capture.inferredAuthor ? ` — ${capture.inferredAuthor}` : ""}
url: ${capture.inferredUrl ?? "none"}
type: ${capture.inferredType}
tags: ${capture.tags.join(", ")}
status: inbox
---

# ${capture.inferredTitle}
${confidenceNote}
## Core idea
${capture.coreIdea}

## Key takeaways
${capture.takeaways.map((t) => `- ${t}`).join("\n")}

## Quotes
${quotesSection}

## Applied to
${capture.appliedTo ?? "_not immediately obvious_"}

## Links to memory
_none yet_

---

<details>
<summary>Raw capture</summary>

${rawContent.trim()}

</details>
`;
}

/** Build the INDEX.md row for a capture. */
export function buildIndexRow(
  date: string,
  capture: ExtractedCapture,
  filename: string,
): string {
  return `| ${date} | [${capture.slug}](inbox/${filename}) | ${capture.coreIdea.slice(0, 80)}... | ${capture.tags.join(", ")} |\n`;
}
