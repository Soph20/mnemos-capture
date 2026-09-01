/**
 * kos — mnemos' Knowledge Operations orchestrator.
 *
 * Drives whatever AI assistant the user configured (`mnemos config set agent ...`)
 * to implement a generated plan in an isolated git worktree. mnemos owns the
 * harness-independent parts: fetching the plan, the worktree, and reporting the
 * Verification Checklist. The assistant is a black box — model-agnostic by design.
 */

import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync, existsSync, appendFileSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { callMcp } from "./hooks.js";
import { readConfig } from "./config.js";

// ── Pure helpers (exported for testing) ──

/** Extract `**filename.md**` plan names from a list_plans response. */
export function parsePlanFilenames(listText: string): string[] {
  const matches = listText.match(/\*\*([^*]+\.md)\*\*/g) ?? [];
  return matches.map((m) => m.replace(/\*\*/g, ""));
}

/** Pick the newest plan. Filenames are date-prefixed (YYYY-MM-DD-...), so lexical desc = newest. */
export function latestPlanFilename(listText: string): string | null {
  const names = parsePlanFilenames(listText);
  if (names.length === 0) return null;
  return [...names].sort((a, b) => b.localeCompare(a))[0] ?? null;
}

/** Pull the Verification Checklist items out of a plan's Markdown. */
export function parseChecklist(planText: string): string[] {
  const section = planText.match(/##\s*Verification Checklist\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!section?.[1]) return [];
  return section[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^- \[[ x]\]/i.test(l))
    .map((l) => l.replace(/^- \[[ x]\]\s*/i, ""));
}

/** Build a unique, sortable branch name for a kos run. */
export function buildKosBranch(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-").replace("T", "-").slice(0, 19);
  return `mnemos/kos-${stamp}`;
}

/** The instruction handed to the assistant. The plan file is the real contract. */
export const KOS_PROMPT =
  "Implement the plan in MNEMOS_PLAN.md in this repository. " +
  "Follow the Codebase Mapping table exactly — change only the files it lists. " +
  "For each step apply the thinking effort named in its Effort column " +
  "(low = quick/mechanical, medium = careful, high = deep reasoning). " +
  "When finished, make sure every item in the Verification Checklist is satisfied.";

// ── Orchestrator ──

function run(cmd: string, cwd?: string): string {
  return execSync(cmd, { cwd, stdio: ["pipe", "pipe", "pipe"] }).toString().trim();
}

export async function kos(apiKey: string, opts: { plan?: string } = {}): Promise<void> {
  const cfg = readConfig();
  if (!cfg.agent) {
    console.error("No agent configured. Tell mnemos which AI worker to drive:\n");
    console.error('  mnemos config set agent "claude -p"               # Claude Code');
    console.error('  mnemos config set agent "codex exec"              # Codex');
    console.error('  mnemos config set agent "aider --yes --message"   # Aider');
    process.exit(1);
  }

  // 1. Resolve the plan — explicit filename, or the newest saved plan
  const planFile = opts.plan ?? latestPlanFilename((await callMcp(apiKey, "list_plans", {}, 15000)) ?? "");
  if (!planFile) {
    console.error("No plans found. Generate one first with the generate_plan MCP tool.");
    process.exit(1);
  }
  const planText = await callMcp(apiKey, "list_plans", { filename: planFile }, 15000);
  if (!planText || !planText.trim()) {
    console.error(`Could not read plan: ${planFile}`);
    process.exit(1);
  }

  // 2. Must be inside a git repo
  let repoRoot: string;
  try {
    repoRoot = run("git rev-parse --show-toplevel");
  } catch {
    console.error("mnemos kos must be run inside a git repository.");
    process.exit(1);
    return;
  }

  // 3. Isolated worktree on a fresh branch
  const branch = buildKosBranch();
  const worktreePath = join(tmpdir(), branch.replace(/\//g, "-"));
  console.log(`Creating isolated worktree on branch ${branch}...`);
  run(`git worktree add -b ${branch} "${worktreePath}"`, repoRoot);

  // 4. Drop the plan in and keep git from tracking it (local exclude, not committed)
  writeFileSync(join(worktreePath, "MNEMOS_PLAN.md"), planText);
  try {
    const excludePath = join(repoRoot, ".git", "info", "exclude");
    if (existsSync(excludePath)) {
      const current = readFileSync(excludePath, "utf-8");
      if (!current.includes("MNEMOS_PLAN.md")) appendFileSync(excludePath, "\nMNEMOS_PLAN.md\n");
    }
  } catch {
    // best-effort
  }

  // 5. Hand off to the user's assistant, running inside the worktree
  console.log(`Launching: ${cfg.agent}\n`);
  try {
    execSync(`${cfg.agent} ${JSON.stringify(KOS_PROMPT)}`, { cwd: worktreePath, stdio: "inherit" });
  } catch {
    console.error("\nThe agent exited with an error. The worktree is preserved for inspection.");
  }

  // 6. Report — branch + the plan's own checklist as the review gate
  const checklist = parseChecklist(planText);
  console.log(`\n${"─".repeat(60)}`);
  console.log(`kos finished. Plan: ${planFile}`);
  console.log(`Branch:   ${branch}`);
  console.log(`Worktree: ${worktreePath}`);
  if (checklist.length > 0) {
    console.log(`\nVerify before merging:`);
    for (const item of checklist) console.log(`  [ ] ${item}`);
  }
  console.log(`\nReview the branch, then merge. Clean up the worktree with:`);
  console.log(`  git worktree remove "${worktreePath}"`);
}
