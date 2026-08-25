import { sql } from "@vercel/postgres";
import type { LlmProvider } from "./types";

export type { LlmProvider };

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

// ── OAuth (MCP remote connector) types ──

export interface OauthClient {
  client_id: string;
  client_name: string | null;
  redirect_uris: string; // JSON-encoded string[]
  created_at: Date;
}

export interface OauthCode {
  code: string;
  client_id: string;
  user_id: number;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string | null;
  resource: string | null;
  expires_at: Date;
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

  // OAuth 2.1 support for MCP remote connectors (Claude iOS / mobile / web).
  // Clients register dynamically (RFC 7591); authorization codes are short-lived
  // and single-use, carrying the PKCE challenge (RFC 7636). Access/refresh tokens
  // are self-contained signed strings (see lib/oauth.ts) and need no table.
  // Login throttling state. Keyed by lowercased username so a targeted PIN
  // brute force is rate-limited across serverless instances (an in-process
  // counter would reset on every cold start).
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      identifier TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      lockouts INTEGER NOT NULL DEFAULT 0,
      window_started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      locked_until TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_clients (
      client_id TEXT PRIMARY KEY,
      client_name TEXT,
      redirect_uris TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS oauth_codes (
      code TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      redirect_uri TEXT NOT NULL,
      code_challenge TEXT NOT NULL,
      code_challenge_method TEXT NOT NULL,
      scope TEXT,
      resource TEXT,
      expires_at TIMESTAMP NOT NULL,
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

// ── OAuth queries ──

export async function createOauthClient(
  clientId: string,
  clientName: string | null,
  redirectUris: string[],
): Promise<void> {
  await sql`
    INSERT INTO oauth_clients (client_id, client_name, redirect_uris)
    VALUES (${clientId}, ${clientName}, ${JSON.stringify(redirectUris)})
    ON CONFLICT (client_id) DO NOTHING
  `;
}

export async function getOauthClient(clientId: string): Promise<OauthClient | null> {
  const { rows } = await sql<OauthClient>`
    SELECT * FROM oauth_clients WHERE client_id = ${clientId} LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function createOauthCode(code: OauthCode): Promise<void> {
  await sql`
    INSERT INTO oauth_codes
      (code, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
    VALUES (
      ${code.code}, ${code.client_id}, ${code.user_id}, ${code.redirect_uri},
      ${code.code_challenge}, ${code.code_challenge_method}, ${code.scope}, ${code.resource},
      ${code.expires_at.toISOString()}
    )
  `;
}

/** Atomically fetch and delete an authorization code, enforcing single use. */
export async function consumeOauthCode(code: string): Promise<OauthCode | null> {
  const { rows } = await sql<OauthCode>`
    DELETE FROM oauth_codes WHERE code = ${code} RETURNING *
  `;
  return rows[0] ?? null;
}

/** Best-effort cleanup of expired authorization codes. */
export async function deleteExpiredOauthCodes(): Promise<void> {
  await sql`DELETE FROM oauth_codes WHERE expires_at < NOW()`;
}
