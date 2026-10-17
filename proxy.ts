import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { isDesktopRequestAllowed } from "@/lib/desktop-origin-guard.mjs";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    // The desktop shell serves the app on an ephemeral loopback origin. Reject
    // browser cross-origin writes so an unrelated website cannot trigger
    // local sync, credential, or bookmark operations through that listener.
    if (process.env.ZEGION_DESKTOP === "1") {
      if (!isDesktopRequestAllowed({
        origin: request.headers.get("origin"),
        requestOrigin: request.nextUrl.origin,
        requestHost: request.headers.get("host"),
        method: request.method,
        fetchSite: request.headers.get("sec-fetch-site"),
      })) {
        return NextResponse.json({ error: "Cross-origin request rejected." }, { status: 403 });
      }
    }

    const ip = getClientIp(request);

    const tier =
      pathname === "/api/cookies" || pathname.startsWith("/api/cookies/")
        ? "strict" as const
        : pathname === "/api/sync" || pathname === "/api/reindex"
          ? "moderate" as const
          : "default" as const;

    const { allowed, remaining, resetTime } = checkRateLimit(ip, tier);

    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
      return NextResponse.json(
        { error: "Too many requests. Please wait before retrying." },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfter),
            "X-RateLimit-Limit": String(
              tier === "strict" ? 5 : tier === "moderate" ? 30 : 60
            ),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = NextResponse.next();

    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("X-Frame-Options", "DENY");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    response.headers.set(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()"
    );
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'self'; form-action 'self'"
    );
    response.headers.set("X-RateLimit-Remaining", String(remaining));

    return response;
  }

  const response = NextResponse.next();

  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
