import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export function GET(): NextResponse {
  try {
    const buildId = fs
      .readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf-8")
      .trim();
    return NextResponse.json({ buildId });
  } catch {
    return NextResponse.json({ buildId: "unknown" });
  }
}
