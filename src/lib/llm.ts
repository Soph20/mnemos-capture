/**
 * LLM extraction logic — system prompt, model config, and parsing.
 * Single source of truth for the extraction pipeline.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedCapture, RelatedCapture, RelevanceResult, SynthesisResult, ApplicationSuggestion, BriefingSuggestion, BriefingOutput, SourceType } from "./types";

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

/** Detect how a capture was submitted based on its content shape. */
export function detectSourceType(content: string): SourceType {
  if (/^https?:\/\/\S+$/.test(content.trim())) return "url";
  if (content.trim().length < 500) return "note";
  return "paste";
}

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
  sourceType?: SourceType,
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
source_type: ${sourceType ?? "paste"}
tags: ${capture.tags.join(", ")}
status: inbox
lowConfidence: ${capture.lowConfidence}
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

// ── Auto-linking ──

const LINKING_PROMPT = `You identify connections between knowledge captures. Given a NEW capture and an INDEX of existing captures, find the most semantically related existing captures.

Return ONLY valid JSON — no markdown, no wrapping:
[{"filename":"path/to/file.md","reason":"one sentence explaining the connection"}]

RULES:
- Return up to 5 related captures, or [] if none are meaningfully related
- Only include captures where the connection is genuinely useful for building on either insight
- The "reason" should explain WHY these two insights connect (shared principle, complementary framing, tension worth exploring)
- Use the exact filename/path from the index rows (e.g. "inbox/2026-04-02-some-slug.md")
- Prefer conceptual connections over superficial tag overlap`;

/** Find captures in the index that are semantically related to a new capture. */
export async function findRelatedCaptures(
  apiKey: string,
  capture: ExtractedCapture,
  indexContent: string,
): Promise<RelatedCapture[]> {
  const client = new Anthropic({ apiKey });

  const userMessage = `NEW CAPTURE:
Title: ${capture.inferredTitle}
Core idea: ${capture.coreIdea}
Tags: ${capture.tags.join(", ")}
Takeaways:
${capture.takeaways.map((t) => `- ${t}`).join("\n")}

INDEX OF EXISTING CAPTURES:
${indexContent}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: [{ type: "text", text: LINKING_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "[]";
  const rawJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(rawJson) as RelatedCapture[];
  } catch {
    return [];
  }
}

// ── Semantic retrieval ──

const RANKING_PROMPT = `You rank knowledge captures by relevance to a task context. Given a TASK DESCRIPTION and an INDEX of captures, rank the most relevant ones.

Return ONLY valid JSON — no markdown, no wrapping:
[{"filename":"path/to/file.md","score":0.95,"reason":"one sentence explaining relevance to the task"}]

RULES:
- Return up to N results (specified in the request), ranked by relevance score (0.0 to 1.0)
- Only include captures with score >= 0.3 (meaningfully relevant)
- Prefer applied insights over theoretical ones
- Prefer captures whose takeaways are directly actionable for the described task
- Use the exact filename/path from the index rows`;

/** Rank captures by semantic relevance to a task description. */
export async function rankByRelevance(
  apiKey: string,
  taskContext: string,
  indexContent: string,
  maxResults: number = 5,
): Promise<RelevanceResult[]> {
  const client = new Anthropic({ apiKey });

  const userMessage = `TASK CONTEXT:
${taskContext}

Return the top ${maxResults} most relevant captures.

INDEX OF CAPTURES:
${indexContent}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    system: [{ type: "text", text: RANKING_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "[]";
  const rawJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(rawJson) as RelevanceResult[];
  } catch {
    return [];
  }
}

// ── Knowledge synthesis ──

const SYNTHESIS_PROMPT = `You distill multiple knowledge captures into concise, actionable rules. Given captures on a TOPIC, synthesize the key principles.

Return ONLY valid JSON — no markdown, no wrapping:
{"topic":"topic-name","rules":["rule 1","rule 2"]}

RULES FOR RULES:
- Each rule must be specific and opinionated (passes "so what?" test)
- Bad: "Error handling is important." Good: "Add source context to every error message — opaque errors make every fix a guess."
- Each rule should be a standalone instruction an AI agent could follow
- Weight battle-tested insights (status: applied) more heavily than theoretical ones
- Aim for 5-15 rules depending on the breadth of the topic
- Rules should compound — later rules can build on earlier ones`;

/** Synthesize multiple capture contents into distilled rules for a topic. */
export async function synthesizeRules(
  apiKey: string,
  topic: string,
  captureContents: string[],
): Promise<SynthesisResult> {
  const client = new Anthropic({ apiKey });

  const userMessage = `TOPIC: ${topic}

CAPTURES TO SYNTHESIZE:
${captureContents.map((c, i) => `--- Capture ${i + 1} ---\n${c}`).join("\n\n")}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: [{ type: "text", text: SYNTHESIS_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "{}";
  const rawJson = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  try {
    return JSON.parse(rawJson) as SynthesisResult;
  } catch {
    return { topic, rules: [] };
  }
}

// ── Agent briefing ──

const BRIEFING_PROMPT = `You compose structured knowledge briefings for AI agents starting a work session. Given PROJECT CONTEXT, ranked captures (with scores and filenames), synthesized rules, and recent inbox items, produce a two-part response.

PART 1 — JSON suggestions block (must come first, before any Markdown):
Output a JSON array wrapped in \`\`\`json...\`\`\` fences. Each item represents a capture to surface:
{"filename":"path/to/file.md","why":"one sentence — how this specifically relates to the current branch/task","benefit":"one sentence — what applying this concretely achieves","where":"specific file or module (e.g. src/api/capture/route.ts, CLAUDE.md)","applyNow":true}

applyNow rules:
- true if capture score >= 0.70 AND insight is directly actionable for the current work
- false if score is 0.30–0.69 (relevant but not urgent)
Return [] if no captures qualify.

PART 2 — Markdown briefing (immediately after the JSON block):
## Relevant Rules
## Apply Now (N insights)
## Knowledge Vault (relevant but not urgent)
## Suggested Next Step

RULES:
- JSON must be valid — no trailing commas, no comments, no extra text before the opening \`\`\`json
- "why" must reference specifics from the project context (branch name, recent commit messages, CLAUDE.md content)
- "where" must name a specific file or module — never "the codebase" or "your project"
- "benefit" must be concrete — not "improves code quality"
- Markdown briefing: concise, ≤ 400 words — agents need signal, not essays
- If a section has nothing to say, write "None applicable." — don't omit the heading`;

/** Compose a session-start briefing for an agent. */
export async function composeBriefing(
  apiKey: string,
  projectContext: string,
  relevantCaptures: Array<{ content: string; filename: string; score: number }>,
  rules: string,
  recentInbox: string[],
): Promise<BriefingOutput> {
  const client = new Anthropic({ apiKey });

  const userMessage = `PROJECT CONTEXT:
${projectContext}

RANKED CAPTURES (with relevance scores):
${relevantCaptures.length > 0
    ? relevantCaptures.map((c, i) => `--- Capture ${i + 1} (score: ${c.score.toFixed(2)}, file: ${c.filename}) ---\n${c.content}`).join("\n\n")
    : "None found."}

SYNTHESIZED RULES:
${rules || "No rules generated yet."}

RECENT INBOX (unreviewed):
${recentInbox.length > 0 ? recentInbox.map((c, i) => `--- Recent ${i + 1} ---\n${c}`).join("\n\n") : "Inbox is empty."}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: [{ type: "text", text: BRIEFING_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  const rawText = message.content[0]?.type === "text" ? message.content[0].text : "Briefing could not be generated.";

  // Parse JSON suggestions block from the response
  const jsonMatch = rawText.match(/```json\n([\s\S]*?)\n```/);
  let suggestions: BriefingSuggestion[] = [];
  if (jsonMatch?.[1]) {
    try {
      suggestions = JSON.parse(jsonMatch[1]) as BriefingSuggestion[];
    } catch {
      suggestions = [];
    }
  }

  return { text: rawText, suggestions };
}

// ── Context-aware application ──

const APPLICATION_PROMPT = `You translate knowledge captures into concrete, code-level application suggestions for an agent's current task. Given TASK CONTEXT (including optional code snippets and file paths) and RELEVANT CAPTURES, produce specific guidance.

Return well-formatted Markdown (NOT JSON). For each applicable insight:

### N. [Short title] (from: filename)
**Insight:** One-line summary of the knowledge
**Apply here:** Specific, concrete instructions — reference the agent's files/code, say exactly what to change or add and why.

RULES:
- Be specific to the agent's code and files — not generic advice
- Reference the agent's file paths and code snippets directly
- Each suggestion should be immediately actionable (copy-paste level specificity when possible)
- Skip captures that don't apply to the agent's current context — quality over quantity
- If no captures are applicable, say so honestly`;

/** Generate concrete application suggestions for an agent's current context. */
export async function generateApplicationSuggestions(
  apiKey: string,
  taskContext: string,
  captureContents: string[],
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const userMessage = `TASK CONTEXT:
${taskContext}

RELEVANT CAPTURES:
${captureContents.map((c, i) => `--- Capture ${i + 1} ---\n${c}`).join("\n\n")}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 1200,
    system: [{ type: "text", text: APPLICATION_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  return message.content[0]?.type === "text" ? message.content[0].text : "No applicable suggestions could be generated.";
}

// ── Implementation plan generation ──

const PLAN_PROMPT = `You generate implementation plans that translate knowledge captures into actionable codebase changes. Given selected captures and project context, produce a structured Markdown plan.

Structure your response exactly as follows:

# Implementation Plan: [short descriptive title]

## Context
Why these captures are relevant now. Ground it in the project context (branch, recent commits, CLAUDE.md).

## Captures Being Applied
For each: \`- **[slug]** — [core idea in ≤ 20 words]\`

## Codebase Mapping
| File | Capture | Change |
|------|---------|--------|
List every file to be changed, which capture slug drives it, and what specifically changes.

## Implementation Steps
For each affected file:
### N. [path/to/file.ts]
**Capture:** [slug]
**Change:** [exact description — function names, what to add/modify/remove]
**Why:** [one sentence connecting the insight to this specific change]

## Architecture Notes
Only include if captures involve architectural decisions. Use ADR format: Status / Context / Decision / Consequences. Omit this section otherwise.

## Product Notes
Only include if captures involve user-facing changes. Omit this section otherwise.

## Verification Checklist
- [ ] [specific, independently verifiable check for each step]

RULES:
- Implementation steps must be specific enough to execute without re-reading the captures
- Reference exact function names and file paths from any codebase files provided
- Omit Architecture Notes and Product Notes if not applicable — do not include empty sections
- Verification items must describe observable outcomes, not subjective assessments`;

/** Generate a structured implementation plan from selected captures and project context. */
export async function generatePlan(
  apiKey: string,
  selectedCaptures: Array<{ filename: string; content: string }>,
  projectContext: string,
  codebaseFiles?: Array<{ path: string; content: string }>,
): Promise<string> {
  const client = new Anthropic({ apiKey });

  const captureSection = selectedCaptures
    .map((c, i) => `--- Capture ${i + 1}: ${c.filename} ---\n${c.content}`)
    .join("\n\n");

  const codebaseSection = codebaseFiles && codebaseFiles.length > 0
    ? `\n\nCODEBASE FILES:\n${codebaseFiles.map((f) => `--- File: ${f.path} ---\n${f.content.slice(0, 4000)}${f.content.length > 4000 ? "\n[truncated]" : ""}`).join("\n\n")}`
    : "";

  const userMessage = `PROJECT CONTEXT:
${projectContext}

SELECTED CAPTURES (${selectedCaptures.length} total):
${captureSection}${codebaseSection}`;

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: [{ type: "text", text: PLAN_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userMessage }],
  });

  return message.content[0]?.type === "text" ? message.content[0].text : "Plan could not be generated.";
}

// ── Capture curation ──

/** Determine curation status for a capture based on URL check and confidence flag. */
export function curateSingle(
  urlStatus: number | null,
  isLowConfidence: boolean,
): { status: "ok" | "stale" | "low_confidence" | "stale_and_low_confidence"; reason: string } {
  const isStale = urlStatus !== null && (urlStatus === 404 || urlStatus === 410);

  if (isStale && isLowConfidence) {
    return {
      status: "stale_and_low_confidence",
      reason: `Source URL is gone (HTTP ${urlStatus}) and extraction was low-confidence.`,
    };
  }
  if (isStale) {
    return { status: "stale", reason: `Source URL returned HTTP ${urlStatus} — content is no longer available.` };
  }
  if (isLowConfidence) {
    return { status: "low_confidence", reason: "Extraction was low-confidence (short input or ambiguous content) — review before acting." };
  }
  return { status: "ok", reason: "Source is live and extraction is well-formed." };
}

// ── Markdown formatting ──

/** Build the INDEX.md row for a capture. */
export function buildIndexRow(
  date: string,
  capture: ExtractedCapture,
  filename: string,
  sourceType?: SourceType,
): string {
  return `| ${date} | [${capture.slug}](inbox/${filename}) | ${capture.coreIdea.slice(0, 80)}... | ${capture.tags.join(", ")} | ${sourceType ?? "—"} |\n`;
}
