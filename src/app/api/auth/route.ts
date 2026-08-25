import { NextRequest, NextResponse } from "next/server";
import { getUserByUsername, updateUserPin } from "@/lib/db";
import { createSession } from "@/lib/session";
import { verifyPin, needsRehash, hashPin, dummyVerify } from "@/lib/pin";
import { checkLock, recordFailure, clearAttempts } from "@/lib/rate-limit";

// PIN login for returning users (mobile quick access).
//
// This endpoint is public and the other factor — the GitHub username — is
// public information, so the PIN is the only real secret. It is therefore
// throttled (see lib/rate-limit) and every failure path returns the SAME
// message and status, so the response can't be used to enumerate accounts.

/** One message for every failure, so nothing distinguishes the cases. */
const INVALID = "Invalid username or PIN.";

function failure(): NextResponse {
  return NextResponse.json({ error: INVALID }, { status: 401 });
}

function lockedOut(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many failed attempts. Try again later." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { pin?: unknown; github_username?: unknown };
  try {
    body = (await req.json()) as { pin?: unknown; github_username?: unknown };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const pin = typeof body.pin === "string" ? body.pin : "";
  const username = typeof body.github_username === "string" ? body.github_username.trim() : "";

  if (!pin || !username) {
    return NextResponse.json({ error: "PIN and username required" }, { status: 400 });
  }

  try {
    // Throttle before touching the password path at all.
    const lock = await checkLock(username);
    if (lock.locked) return lockedOut(lock.retryAfter);

    const user = await getUserByUsername(username);

    if (!user || !user.pin_hash) {
      // Spend comparable CPU to a real verification so timing doesn't reveal
      // whether the account exists, and still count the attempt.
      dummyVerify();
      const after = await recordFailure(username);
      return after.locked ? lockedOut(after.retryAfter) : failure();
    }

    if (!verifyPin(pin, user.pin_hash)) {
      const after = await recordFailure(username);
      return after.locked ? lockedOut(after.retryAfter) : failure();
    }

    // Correct PIN. Transparently upgrade a legacy/outdated hash.
    if (needsRehash(user.pin_hash)) {
      try {
        await updateUserPin(user.id, hashPin(pin));
      } catch {
        // A failed upgrade must not block a valid login.
      }
    }

    await clearAttempts(username);
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[auth] login error:", err);
    return NextResponse.json({ error: "[auth] Login failed." }, { status: 500 });
  }
}
