import { NextResponse } from "next/server";
import {
  readCookieConfig,
  writeCookieConfig,
  describeCookieMode,
} from "@/lib/cookie-config";
import type { CookieConfig } from "@/lib/cookie-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = readCookieConfig();
  const mode = describeCookieMode(config);
  return NextResponse.json({
    config: {
      source: config.source,
      browser: config.browser || null,
      hasCookies: Boolean(config.ct0 && config.authToken),
    },
    cookieMode: mode,
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<CookieConfig>;

    if (body.source !== "auto" && body.source !== "manual") {
      return NextResponse.json(
        { error: "source must be 'auto' or 'manual'" },
        { status: 400 }
      );
    }

    if (body.source === "auto" && body.browser) {
      const valid = ["chrome", "firefox", "edge", "brave"];
      if (!valid.includes(body.browser)) {
        return NextResponse.json(
          { error: `browser must be one of: ${valid.join(", ")}` },
          { status: 400 }
        );
      }
    }

    const next: CookieConfig = {
      source: body.source,
      browser: body.source === "auto" ? body.browser || "firefox" : undefined,
      ct0: body.source === "manual" ? body.ct0 : undefined,
      authToken: body.source === "manual" ? body.authToken : undefined,
    };

    const saved = writeCookieConfig(next);
    const mode = describeCookieMode(saved);

    return NextResponse.json({
      ok: true,
      config: {
        source: saved.source,
        browser: saved.browser || null,
        hasCookies: Boolean(saved.ct0 && saved.authToken),
      },
      cookieMode: mode,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save cookie config" },
      { status: 500 }
    );
  }
}
