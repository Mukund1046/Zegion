import { NextResponse } from "next/server";
import { reindexBookmarks } from "@/lib/server-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST() {
  try {
    const payload = await reindexBookmarks();
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
