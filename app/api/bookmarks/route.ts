import { NextResponse } from "next/server";
import { readBookmarksData } from "@/lib/server-jobs";
import { requireLocalOrApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  const data = readBookmarksData();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "no-store" },
  });
}
