import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join } from "path";
import { getSession } from "@/lib/session";
import { ensureProfileColumns, updateUserProfile } from "@/lib/db";
import {
  githubAvatarUrl,
  validateAvatarData,
  validateDisplayName,
} from "@/lib/profile";

function appVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function mePayload(user: {
  github_username: string;
  display_name: string | null;
  avatar_data: string | null;
  api_key: string | null;
  pin_hash: string | null;
}) {
  return {
    githubUsername: user.github_username,
    displayName: user.display_name?.trim() || user.github_username,
    avatarUrl: user.avatar_data || githubAvatarUrl(user.github_username),
    hasCustomAvatar: Boolean(user.avatar_data),
    hasMcpKey: Boolean(user.api_key),
    hasPin: Boolean(user.pin_hash),
    version: appVersion(),
  };
}

export async function GET(): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  await ensureProfileColumns();
  return NextResponse.json(mePayload(user));
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { displayName?: unknown; avatarData?: unknown };
  try {
    body = await req.json() as { displayName?: unknown; avatarData?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fields: { displayName?: string | null; avatarData?: string | null } = {};

  if ("displayName" in body) {
    if (typeof body.displayName !== "string") {
      return NextResponse.json({ error: "Name must be a string." }, { status: 400 });
    }
    const error = validateDisplayName(body.displayName);
    if (error) return NextResponse.json({ error }, { status: 400 });
    fields.displayName = body.displayName.trim();
  }

  if ("avatarData" in body) {
    if (body.avatarData === null) {
      fields.avatarData = null;
    } else if (typeof body.avatarData === "string") {
      const error = validateAvatarData(body.avatarData);
      if (error) return NextResponse.json({ error }, { status: 400 });
      fields.avatarData = body.avatarData;
    } else {
      return NextResponse.json({ error: "Invalid image." }, { status: 400 });
    }
  }

  if (fields.displayName === undefined && fields.avatarData === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  await updateUserProfile(user.id, fields);
  const next = {
    ...user,
    display_name: fields.displayName !== undefined ? fields.displayName : user.display_name,
    avatar_data: fields.avatarData !== undefined ? fields.avatarData : user.avatar_data,
  };
  return NextResponse.json(mePayload(next));
}
