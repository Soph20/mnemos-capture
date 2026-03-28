import { cookies } from "next/headers";
import { getUserById } from "./db";
import { env } from "./env";
import type { User } from "./db";

const SESSION_COOKIE = "mnemos_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

// Simple session: cookie stores the user ID, signed with HMAC.
// For production at scale, you'd use JWT or a session store. This is intentionally simple.

function encode(userId: number): string {
  const payload = String(userId);
  const crypto = require("crypto") as typeof import("crypto");
  const sig = crypto.createHmac("sha256", env.sessionSecret).update(payload).digest("hex");
  return Buffer.from(`${payload}:${sig}`).toString("base64");
}

function decode(token: string): number | null {
  try {
    const raw = Buffer.from(token, "base64").toString("utf-8");
    const [payload, sig] = raw.split(":");
    if (!payload || !sig) return null;

    const crypto = require("crypto") as typeof import("crypto");
    const expected = crypto.createHmac("sha256", env.sessionSecret).update(payload).digest("hex");

    if (sig !== expected) return null;
    return parseInt(payload, 10);
  } catch {
    return null;
  }
}

export async function createSession(userId: number): Promise<void> {
  const token = encode(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function getSession(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const userId = decode(token);
  if (userId === null) return null;

  return getUserById(userId);
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
