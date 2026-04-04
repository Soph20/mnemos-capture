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
