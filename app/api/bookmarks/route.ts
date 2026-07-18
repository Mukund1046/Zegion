import { NextResponse } from "next/server";
import { readBookmarksData } from "@/lib/server-jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = readBookmarksData();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
