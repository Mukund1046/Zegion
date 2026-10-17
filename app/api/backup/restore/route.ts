import { NextResponse } from "next/server";
import { z } from "zod";
import { restoreLibraryBackupAction } from "@/lib/server-jobs";
import { requireLocalOrApiKey, sanitizeError } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const restoreSchema = z.object({ backupId: z.string().min(1).max(120) });

export async function POST(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;
  try {
    const parsed = restoreSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid restore request." }, { status: 400 });
    }
    const payload = await restoreLibraryBackupAction(parsed.data.backupId);
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
