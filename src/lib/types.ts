/** Status of a capture in the knowledge repo. */
export type CaptureStatus = "inbox" | "applied" | "archived";

/** Content types supported by the knowledge extraction engine. */
export type ContentType =
  | "article"
  | "blog"
  | "research"
  | "transcript"
  | "notes"
  | "post"
  | "book"
  | "thread"
  | "video";

/** Structured output from the LLM extraction. */
export interface ExtractedCapture {
  slug: string;
  inferredTitle: string;
  inferredAuthor: string | null;
  inferredUrl: string | null;
  inferredType: ContentType;
  coreIdea: string;
  takeaways: string[];
  quotes: string[];
  tags: string[];
  appliedTo: string | null;
  lowConfidence: boolean;
}

/** A related capture identified by the auto-linking system. */
export interface RelatedCapture {
  filename: string;
  reason: string;
}

/** A capture ranked by semantic relevance to a task context. */
export interface RelevanceResult {
  filename: string;
  score: number;
  reason: string;
}

/** Output from the knowledge synthesis LLM call. */
export interface SynthesisResult {
  topic: string;
  rules: string[];
}

/** A concrete suggestion for applying knowledge to the agent's current context. */
export interface ApplicationSuggestion {
  filename: string;
  insight: string;
  suggestion: string;
}
