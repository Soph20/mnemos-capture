import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session";
import { updateUserRepo, updateUserPin, updateUserApiKey, updateUserLlmKey } from "@/lib/db";

interface GithubRepoResponse {
  full_name: string;
}

async function githubApiGet(token: string, path: string): Promise<{ ok: boolean; data: unknown; status: number }> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const data: unknown = res.ok ? await res.json() : null;
  return { ok: res.ok, data, status: res.status };
}

async function githubApiPost(token: string, path: string, body: Record<string, unknown>): Promise<{ ok: boolean; data: unknown; status: number }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data: unknown = res.ok ? await res.json() : null;
  return { ok: res.ok, data, status: res.status };
}

async function githubApiPut(token: string, path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`https://api.github.com${path}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

async function createKnowledgeRepo(token: string, username: string, repoName: string): Promise<string> {
  const fullRepo = `${username}/${repoName}`;

  // Check if repo exists
  const check = await githubApiGet(token, `/repos/${fullRepo}`);
  if (check.ok) return fullRepo;

  // Create repo
  const createRes = await githubApiPost(token, "/user/repos", {
    name: repoName,
    description: "Knowledge hub for Mnemos — captured insights routed to agentic workflows",
    private: false,
    auto_init: true,
  });

  if (!createRes.ok) throw new Error("Failed to create repository");

  // Wait for GitHub to initialize
  await new Promise((r) => setTimeout(r, 2000));

  // Create INDEX.md
  const indexContent = `# Knowledge Hub — Master Index\n\n> Search by topic, tag, date, or keyword.\n\n| Date | Resource | Keywords | Tags |\n|------|----------|----------|------|\n`;

  await githubApiPut(token, `/repos/${fullRepo}/contents/INDEX.md`, {
    message: "Initialize knowledge hub",
    content: Buffer.from(indexContent).toString("base64"),
  });

  // Create folder structure
  const folders = ["inbox"];
  for (const folder of folders) {
    await githubApiPut(token, `/repos/${fullRepo}/contents/${folder}/.gitkeep`, {
      message: `Create ${folder}/`,
      content: Buffer.from("").toString("base64"),
    });
  }

  // Update README
  const readmeRes = await githubApiGet(token, `/repos/${fullRepo}/contents/README.md`);
  const readmeSha = readmeRes.ok ? ((readmeRes.data as { sha: string }).sha) : undefined;

  const readmeContent = `# My Knowledge Hub\n\nCaptures from [Mnemos](https://github.com/Soph20/mnemos-capture) land here automatically.\n\nAll captures go to \`inbox/\` as structured Markdown files. Each file contains the core idea, key takeaways, quotes, tags, and an "Applied to" field linking the insight to something actionable.\n`;

  const readmeBody: Record<string, unknown> = {
    message: "Add knowledge hub README",
    content: Buffer.from(readmeContent).toString("base64"),
  };
  if (readmeSha) readmeBody["sha"] = readmeSha;
  await githubApiPut(token, `/repos/${fullRepo}/contents/README.md`, readmeBody);

  return fullRepo;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await req.json()) as { repoName: string; pin: string; anthropicKey: string };

  if (!body.repoName?.trim() || !body.pin?.trim() || !body.anthropicKey?.trim()) {
    return NextResponse.json({ error: "Repo name, PIN, and Anthropic API key are required" }, { status: 400 });
  }

  try {
    // Create knowledge repo
    const fullRepo = await createKnowledgeRepo(
      user.github_token,
      user.github_username,
      body.repoName.trim()
    );

    // Save repo to user
    await updateUserRepo(user.id, fullRepo);

    // Hash and save PIN
    const pinHash = crypto.createHash("sha256").update(body.pin).digest("hex");
    await updateUserPin(user.id, pinHash);

    // Save LLM key (Anthropic for now, multi-provider ready)
    await updateUserLlmKey(user.id, "anthropic", body.anthropicKey.trim());

    // Generate API key for MCP / CLI access
    const apiKey = `mnemos_${crypto.randomBytes(24).toString("hex")}`;
    await updateUserApiKey(user.id, apiKey);

    return NextResponse.json({
      ok: true,
      repo: fullRepo,
      repoUrl: `https://github.com/${fullRepo}`,
      apiKey,
    });
  } catch (err) {
    console.error("Onboarding error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to set up" },
      { status: 500 }
    );
  }
}
