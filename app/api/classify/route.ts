import { NextResponse } from "next/server";
import { classifyBookmarks, getClassificationJobStatus } from "@/lib/server-jobs";
import { requireLocalOrApiKey, sanitizeError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;
  const runId = new URL(request.url).searchParams.get("runId") || "";
  const status = getClassificationJobStatus(runId);
  if (!status) return NextResponse.json({ error: "Classification run not found." }, { status: 404 });
  return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  try {
    const payload = await classifyBookmarks();
    return NextResponse.json(payload, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
    return NextResponse.json(
      { error: sanitizeError(error) },
      { status: statusCode }
    );
  }
}
