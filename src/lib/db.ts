import { sql } from "@vercel/postgres";

export type LlmProvider = "anthropic" | "openai" | "google";

export interface User {
  id: number;
  github_id: number;
  github_username: string;
  github_token: string;
  github_repo: string | null;
  pin_hash: string | null;
  api_key: string | null;
  llm_provider: LlmProvider;
  llm_api_key: string | null;
  created_at: Date;
}

// ── Schema initialization ──

export async function initDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      github_id INTEGER UNIQUE NOT NULL,
      github_username TEXT NOT NULL,
      github_token TEXT NOT NULL,
      github_repo TEXT,
      pin_hash TEXT,
      api_key TEXT UNIQUE,
      llm_provider TEXT DEFAULT 'anthropic',
      llm_api_key TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;
}

// ── Queries ──

export async function getUserByGithubId(githubId: number): Promise<User | null> {
  const { rows } = await sql<User>`
    SELECT * FROM users WHERE github_id = ${githubId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getUserById(id: number): Promise<User | null> {
  const { rows } = await sql<User>`
    SELECT * FROM users WHERE id = ${id} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createUser(
  githubId: number,
  githubUsername: string,
  githubToken: string
): Promise<User> {
  const { rows } = await sql<User>`
    INSERT INTO users (github_id, github_username, github_token)
    VALUES (${githubId}, ${githubUsername}, ${githubToken})
    ON CONFLICT (github_id) DO UPDATE SET
      github_username = ${githubUsername},
      github_token = ${githubToken}
    RETURNING *
  `;
  return rows[0] as User;
}

export async function updateUserRepo(userId: number, repo: string): Promise<void> {
  await sql`UPDATE users SET github_repo = ${repo} WHERE id = ${userId}`;
}

export async function updateUserPin(userId: number, pinHash: string): Promise<void> {
  await sql`UPDATE users SET pin_hash = ${pinHash} WHERE id = ${userId}`;
}

export async function getUserByApiKey(apiKey: string): Promise<User | null> {
  const { rows } = await sql<User>`
    SELECT * FROM users WHERE api_key = ${apiKey} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function updateUserApiKey(userId: number, apiKey: string): Promise<void> {
  await sql`UPDATE users SET api_key = ${apiKey} WHERE id = ${userId}`;
}

export async function updateUserLlmKey(userId: number, provider: LlmProvider, apiKey: string): Promise<void> {
  await sql`UPDATE users SET llm_provider = ${provider}, llm_api_key = ${apiKey} WHERE id = ${userId}`;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const { rows } = await sql<User>`
    SELECT * FROM users WHERE github_username = ${username} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getUserCount(): Promise<number> {
  const { rows } = await sql<{ count: string }>`SELECT COUNT(*) as count FROM users`;
  return parseInt(rows[0]?.count ?? "0", 10);
}
