import { NextResponse } from "next/server";

const SAFE_PREFIXES = ["Please wait ", "is already running"];

export function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  if (SAFE_PREFIXES.some((p) => message.startsWith(p))) return message;
  return "Unexpected server error";
}

export function requireLocalOrApiKey(request: Request): NextResponse | null {
  const apiKey = process.env.X_API_KEY;

  if (apiKey) {
    const header = request.headers.get("x-api-key");
    if (header === apiKey) return null;
  }

  const url = new URL(request.url);
  if (url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "localhost") return null;

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
