import { NextResponse } from "next/server";
import { syncBookmarks } from "@/lib/server-jobs";
import { requireLocalOrApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  try {
    const payload = await syncBookmarks();
    return NextResponse.json(payload);
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected server error" },
      { status: statusCode }
    );
  }
}
