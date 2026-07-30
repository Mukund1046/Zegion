interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const store = new Map<string, RateLimitEntry>();

const TIERS: Record<string, { limit: number; windowMs: number }> = {
  strict: { limit: 5, windowMs: 60 * 1000 },
  moderate: { limit: 30, windowMs: 60 * 1000 },
  default: { limit: 60, windowMs: 60 * 1000 },
};

export function checkRateLimit(
  identifier: string,
  tier: keyof typeof TIERS = "default"
): { allowed: boolean; remaining: number; resetTime: number } {
  const { limit, windowMs } = TIERS[tier];
  const now = Date.now();
  const key = `${tier}:${identifier}`;
  const entry = store.get(key);

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetTime: now + windowMs };
  }

  entry.count++;
  return {
    allowed: entry.count <= limit,
    remaining: Math.max(0, limit - entry.count),
    resetTime: entry.resetTime,
  };
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "127.0.0.1";
}
