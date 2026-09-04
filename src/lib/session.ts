import { cookies } from "next/headers";
import crypto from "crypto";
import { getUserById } from "./db";
import { env } from "./env";
import type { User } from "./db";

const SESSION_COOKIE = "xmu_session";
const LEGACY_SESSION_COOKIE = "mnemos_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

/**
 * Session cookie: a signed, self-contained token.
 *
 * The previous format signed only the user id, so a token never expired and a
 * stolen cookie stayed valid forever — the cookie's own maxAge is a client-side
 * hint an attacker simply ignores. Tokens now carry their own expiry and a
 * token_version that is bumped to revoke every outstanding session for a user
 * (see revokeUserTokens in lib/db).
 *
 * Legacy tokens in the old format are rejected, so everyone re-authenticates
 * once after this ships — that is the point: it is what retires the
 * never-expiring sessions.
 */

const VERSION = "v2";

interface SessionPayload {
  u: number; // user id
  v: number; // token_version, for bulk revocation
  exp: number; // expiry (epoch seconds)
}

function sign(data: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

function encode(userId: number, tokenVersion: number): string {
  const payload: SessionPayload = {
    u: userId,
    v: tokenVersion,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${VERSION}.${body}.${sign(body)}`;
}

function decode(token: string): SessionPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const [, body, sig] = parts as [string, string, string];

  // Constant-time signature comparison.
  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as SessionPayload;
  } catch {
    return null;
  }

  if (typeof payload.u !== "number" || typeof payload.v !== "number") return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export async function createSession(userId: number, tokenVersion = 0): Promise<void> {
  const token = encode(userId, tokenVersion);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = decode(token);
  if (!payload) return null;

  const user = await getUserById(payload.u);
  if (!user) return null;

  // A bumped token_version retires every session issued before the bump.
  if ((user.token_version ?? 0) !== payload.v) return null;

  return user;
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete(LEGACY_SESSION_COOKIE);
}
