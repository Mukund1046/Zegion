import { NextResponse } from "next/server";
import { readStatusSnapshot } from "@/lib/server-jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(readStatusSnapshot());
}
