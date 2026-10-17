import { NextResponse } from "next/server";
import { backupLibrary, listLibraryBackupsAction } from "@/lib/server-jobs";
import { requireLocalOrApiKey, sanitizeError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;
  return NextResponse.json(
    { backups: listLibraryBackupsAction() },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;
  try {
    const payload = await backupLibrary();
    return NextResponse.json(payload, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const statusCode =
      error instanceof Error && "statusCode" in error
        ? (error as Error & { statusCode: number }).statusCode
        : 500;
    return NextResponse.json({ error: sanitizeError(error) }, { status: statusCode });
  }
}
