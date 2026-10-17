import { NextResponse } from "next/server";
import { requireLocalOrApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;
  return NextResponse.json(
    { error: "Classification review is read-only. New classifications are committed by Field Theory." },
    { status: 410 }
  );
}
