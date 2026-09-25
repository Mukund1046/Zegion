import { NextResponse } from "next/server";
import { requireLocalOrApiKey } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const KNOWN_BROWSERS = ["firefox", "chrome", "edge", "brave"] as const;

// Reports how a browser's os_crypt key is wrapped (DPAPI vs App-Bound) so the
// Sync Settings dialog can resolve Auto capability live, especially for Edge
// where it is version-dependent. Returns only the wrapper class — never key
// material, cookie values, or secrets.
export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  const { searchParams } = new URL(request.url);
  const browser = (searchParams.get("browser") || "").toLowerCase();
  if (!(KNOWN_BROWSERS as readonly string[]).includes(browser)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let prefix = "missing";
  try {
    const { readKeyPrefix } = await import("@/lib/browser-profiles.js");
    prefix = readKeyPrefix(browser);
  } catch {
    prefix = "missing";
  }
  return NextResponse.json({ browser, prefix });
}
