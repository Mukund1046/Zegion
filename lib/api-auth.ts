import { NextResponse } from "next/server";

// Prefix allowlist for error messages returned to the client. These messages
// are constructed by our own code without secret values (names and paths
// only, never cookie contents), so they are safe to surface. Anything else
// is collapsed to a generic message to avoid leaking session material from
// child-process stderr.
const SAFE_PREFIXES = [
  "Please wait ",
  "is already running",
  "Sync failed: ",
  "Manual mode requires ",
  "Missing ",
  "Invalid request",
  "Bookmarks JSONL not found",
  "Script timed out",
];

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
