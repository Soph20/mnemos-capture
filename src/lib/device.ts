/**
 * Device binding for PIN quick-unlock.
 *
 * A PIN is a low-entropy secret. Accepting one from anywhere in the world, keyed
 * only by a public GitHub username, makes it a *password* — which is not what a
 * 6-character PIN can safely be. The PIN is meant to be what the product says it
 * is: a fast re-unlock on a device that has already proved itself via GitHub.
 *
 * So GitHub sign-in issues a long-lived, signed, httpOnly device cookie, and PIN
 * login is only accepted when that cookie is present and valid. The cookie also
 * identifies *which* user is unlocking, so the username stops being half the
 * credential — and stops being an enumeration surface.
 *
 * The device token carries the user's token_version, so revoking tokens (via
 * rotating the MCP key) also un-trusts every device.
 */

import { cookies } from "next/headers";
import crypto from "crypto";
import { env } from "./env";

const DEVICE_COOKIE = "mnemos_device";
/** Long-lived: this marks a device as known, it is not a session. */
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 180; // 180 days

const VERSION = "d1";

export interface DevicePayload {
  u: number; // user id
  v: number; // token_version at issue time
  exp: number; // expiry (epoch seconds)
}

function sign(data: string): string {
  return crypto.createHmac("sha256", env.sessionSecret).update(data).digest("base64url");
}

/** Build a signed device token. */
export function issueDeviceToken(userId: number, tokenVersion: number): string {
  const payload: DevicePayload = {
    u: userId,
    v: tokenVersion,
    exp: Math.floor(Date.now() / 1000) + DEVICE_MAX_AGE,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${VERSION}.${body}.${sign(body)}`;
}

/** Verify a device token's signature and expiry. Returns the payload or null. */
export function verifyDeviceToken(token: string): DevicePayload | null {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return null;

  const [, body, sig] = parts as [string, string, string];

  const expected = sign(body);
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  let payload: DevicePayload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf-8")) as DevicePayload;
  } catch {
    return null;
  }

  if (typeof payload.u !== "number" || typeof payload.v !== "number") return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

export const DEVICE_COOKIE_NAME = DEVICE_COOKIE;

/** Cookie options shared by the routes that set this cookie. */
export function deviceCookieOptions(): {
  httpOnly: true;
  secure: boolean;
  sameSite: "lax";
  maxAge: number;
  path: string;
} {
  return {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: "lax",
    maxAge: DEVICE_MAX_AGE,
    path: "/",
  };
}

/** Read and verify the device cookie from the incoming request. */
export async function getDevicePayload(): Promise<DevicePayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  return verifyDeviceToken(token);
}
