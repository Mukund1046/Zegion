import { NextResponse } from "next/server";
import { readStatusSnapshot } from "@/lib/server-jobs";
import { requireLocalOrApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  return NextResponse.json(readStatusSnapshot());
}
