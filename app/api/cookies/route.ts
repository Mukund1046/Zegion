import { NextResponse } from "next/server";
import {
  readCookieConfig,
  writeCookieConfig,
  describeCookieMode,
} from "@/lib/cookie-config";
import { requireLocalOrApiKey, sanitizeError } from "@/lib/api-auth";
import { z } from "zod";

const cookieConfigSchema = z.object({
  source: z.enum(["auto", "manual"]),
  browser: z.enum(["chrome", "firefox", "edge", "brave"]).optional(),
  ct0: z.string().max(1024).optional(),
  authToken: z.string().max(1024).optional(),
});

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

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
  const auth = requireLocalOrApiKey(request);
  if (auth) return auth;

  try {
    const parsed = cookieConfigSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid request" },
        { status: 400 }
      );
    }

    const { source, browser, ct0, authToken } = parsed.data;

    const next = {
      source,
      browser: source === "auto" ? browser || "firefox" : undefined,
      ct0: source === "manual" ? ct0 : undefined,
      authToken: source === "manual" ? authToken : undefined,
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
      { error: sanitizeError(error) },
      { status: 500 }
    );
  }
}
