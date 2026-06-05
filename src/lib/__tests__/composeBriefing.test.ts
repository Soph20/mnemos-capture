import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted ensures mockCreate is available when vi.mock factory runs
const mockCreate = vi.hoisted(() => vi.fn());

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// Import after the mock is set up
const { composeBriefing } = await import("../llm");

const CAPTURES = [
  { content: "## Core idea\nInsight A about error handling.", filename: "inbox/2026-05-01-insight-a.md", score: 0.92 },
  { content: "## Core idea\nInsight B about caching.", filename: "applied/2026-04-10-insight-b.md", score: 0.55 },
];

function makeResponse(text: string) {
  return { content: [{ type: "text", text }] };
}

describe("composeBriefing — JSON block parsing", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns text and correctly parses applyNow=true suggestions", async () => {
    mockCreate.mockResolvedValue(makeResponse(`\`\`\`json
[{"filename":"inbox/2026-05-01-insight-a.md","why":"Matches your retry work","benefit":"Eliminates silent failures","where":"src/api/capture/route.ts","applyNow":true}]
\`\`\`

## Relevant Rules
None applicable.

## Apply Now (1 insight)
Some content.`));

    const output = await composeBriefing("test-key", "current project", CAPTURES, "", []);

    expect(output.suggestions).toHaveLength(1);
    expect(output.suggestions[0]?.filename).toBe("inbox/2026-05-01-insight-a.md");
    expect(output.suggestions[0]?.applyNow).toBe(true);
    expect(output.suggestions[0]?.why).toBe("Matches your retry work");
    expect(output.suggestions[0]?.benefit).toBe("Eliminates silent failures");
    expect(output.suggestions[0]?.where).toBe("src/api/capture/route.ts");
  });

  it("returns text and separates applyNow=true from applyNow=false", async () => {
    mockCreate.mockResolvedValue(makeResponse(`\`\`\`json
[
  {"filename":"inbox/2026-05-01-insight-a.md","why":"Direct match","benefit":"Fast fix","where":"src/lib/llm.ts","applyNow":true},
  {"filename":"applied/2026-04-10-insight-b.md","why":"Background context","benefit":"Future improvement","where":"CLAUDE.md","applyNow":false}
]
\`\`\`

## Apply Now
...`));

    const output = await composeBriefing("test-key", "project", CAPTURES, "", []);

    expect(output.suggestions).toHaveLength(2);
    expect(output.suggestions.filter((s) => s.applyNow)).toHaveLength(1);
    expect(output.suggestions.filter((s) => !s.applyNow)).toHaveLength(1);
  });

  it("returns empty suggestions when JSON block is missing", async () => {
    mockCreate.mockResolvedValue(makeResponse(`## Relevant Rules
None applicable.

## Apply Now
No urgent insights.`));

    const output = await composeBriefing("test-key", "project", CAPTURES, "", []);

    expect(output.suggestions).toHaveLength(0);
    expect(output.text).toContain("## Relevant Rules");
  });

  it("returns empty suggestions when JSON block contains invalid JSON", async () => {
    mockCreate.mockResolvedValue(makeResponse(`\`\`\`json
not valid json [[[
\`\`\`

## Apply Now
None.`));

    const output = await composeBriefing("test-key", "project", CAPTURES, "", []);

    expect(output.suggestions).toHaveLength(0);
  });

  it("returns empty suggestions when JSON block is an empty array", async () => {
    mockCreate.mockResolvedValue(makeResponse(`\`\`\`json
[]
\`\`\`

## Apply Now
Nothing urgent.`));

    const output = await composeBriefing("test-key", "project", CAPTURES, "", []);

    expect(output.suggestions).toHaveLength(0);
  });

  it("always returns the full raw text (including JSON block) in output.text", async () => {
    const rawText = `\`\`\`json
[{"filename":"inbox/x.md","why":"x","benefit":"y","where":"z.ts","applyNow":true}]
\`\`\`

## Relevant Rules
Some rules.`;
    mockCreate.mockResolvedValue(makeResponse(rawText));

    const output = await composeBriefing("test-key", "project", CAPTURES, "", []);

    expect(output.text).toBe(rawText);
  });

  it("returns fallback text and empty suggestions when Anthropic returns no content", async () => {
    mockCreate.mockResolvedValue({ content: [] });

    const output = await composeBriefing("test-key", "project", [], "", []);

    expect(output.text).toContain("could not be generated");
    expect(output.suggestions).toHaveLength(0);
  });

  it("includes score and filename in the message sent to Anthropic", async () => {
    mockCreate.mockResolvedValue(makeResponse("```json\n[]\n```\n## Done."));

    await composeBriefing("test-key", "my project", CAPTURES, "", []);

    const callArgs = mockCreate.mock.calls[0]?.[0] as { messages: Array<{ content: string }> };
    const userContent = callArgs.messages[0]?.content ?? "";
    expect(userContent).toContain("score: 0.92");
    expect(userContent).toContain("inbox/2026-05-01-insight-a.md");
  });
});
