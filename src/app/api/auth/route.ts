import { NextRequest, NextResponse } from "next/server";
import { getUserById, updateUserPin } from "@/lib/db";
import { createSession } from "@/lib/session";
import { verifyPin, needsRehash, hashPin } from "@/lib/pin";
import { checkLock, recordFailure, clearAttempts } from "@/lib/rate-limit";
import { getDevicePayload } from "@/lib/device";

// PIN quick-unlock for returning users.
//
// A PIN is a low-entropy secret, so it is only accepted on a device that has
// already proved itself through GitHub sign-in (see lib/device). Without that
// device cookie there is no PIN path at all — the caller signs in with GitHub.
//
// The device cookie also says *who* is unlocking, so the username is no longer
// part of the credential and no longer an enumeration surface. Attempts are
// still throttled per user (lib/rate-limit), since a shared or stolen device
// would otherwise get unlimited guesses.

const INVALID = "Incorrect PIN.";
const NO_DEVICE = "Sign in with GitHub on this device first.";

function lockedOut(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many failed attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

/**
 * Report whether PIN unlock is available on this device, so the login screen
 * can offer it instead of showing a form that cannot work. Returns the username
 * only when the device is already verified for that account.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const device = await getDevicePayload();
    if (!device) return NextResponse.json({ available: false });

    const user = await getUserById(device.u);
    if (!user || !user.pin_hash) return NextResponse.json({ available: false });
    if ((user.token_version ?? 0) !== device.v) return NextResponse.json({ available: false });

    return NextResponse.json({ available: true, username: user.github_username });
  } catch {
    return NextResponse.json({ available: false });
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { pin?: unknown };
  try {
    body = (await req.json()) as { pin?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin : "";
  if (!pin) {
    return NextResponse.json({ error: "PIN required" }, { status: 400 });
  }

  try {
    // No verified device → no PIN login. This is the whole point: it stops a
    // low-entropy secret from being a from-anywhere credential.
    const device = await getDevicePayload();
    if (!device) {
      return NextResponse.json({ error: NO_DEVICE, needsGithub: true }, { status: 401 });
    }

    const user = await getUserById(device.u);
    if (!user || !user.pin_hash) {
      return NextResponse.json({ error: NO_DEVICE, needsGithub: true }, { status: 401 });
    }

    // A bumped token_version un-trusts every device.
    if ((user.token_version ?? 0) !== device.v) {
      return NextResponse.json({ error: NO_DEVICE, needsGithub: true }, { status: 401 });
    }

    const key = `user:${user.id}`;
    const lock = await checkLock(key);
    if (lock.locked) return lockedOut(lock.retryAfter);

    if (!verifyPin(pin, user.pin_hash)) {
      const after = await recordFailure(key);
      return after.locked
        ? lockedOut(after.retryAfter)
        : NextResponse.json({ error: INVALID }, { status: 401 });
    }

    // Correct PIN. Transparently upgrade a legacy/outdated hash.
    if (needsRehash(user.pin_hash)) {
      try {
        await updateUserPin(user.id, hashPin(pin));
      } catch {
        // A failed upgrade must not block a valid login.
      }
    }

    await clearAttempts(key);
    await createSession(user.id, user.token_version ?? 0);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth] PIN unlock error:", err);
    return NextResponse.json({ error: "[auth] Unlock failed." }, { status: 500 });
  }
}
