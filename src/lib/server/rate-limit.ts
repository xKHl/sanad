/**
 * Best-effort in-memory sliding-window rate limiter (SPEC §11). On serverless platforms each
 * instance keeps its own window, so this limits bursts rather than enforcing a global quota;
 * the provider account's own limits remain the real cap.
 */
export function createRateLimiter(limitPerMinute: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return {
    check(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfterSeconds: number } {
      if (limitPerMinute <= 0) return { ok: true };
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limitPerMinute) {
        const oldest = recent[0] ?? now;
        hits.set(key, recent);
        return {
          ok: false,
          retryAfterSeconds: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
        };
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return { ok: true };
    },
  };
}

export function clientKey(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip') || 'unknown';
}
