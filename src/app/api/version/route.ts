import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

function appVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf-8")) as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export function GET(): NextResponse {
  try {
    const buildId = fs
      .readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf-8")
      .trim();
    return NextResponse.json({ buildId, version: appVersion() });
  } catch {
    return NextResponse.json({ buildId: "unknown", version: appVersion() });
  }
}