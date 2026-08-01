/**
 * A fixed-window rate limiter for the one route that spends money.
 *
 * The app has no login by design — a bill link is meant to be textable — so the
 * upload endpoint is reachable by anyone who finds the URL, and every upload
 * costs real money at the Anthropic API. This caps the damage.
 *
 * Deliberately in-memory: serverless instances don't share state, so this is a
 * per-instance best-effort cap, not a guarantee. That is the right level of
 * effort here. The hard backstop is the spend limit set on the API key itself,
 * which no amount of application code can substitute for. Reach for a shared
 * store (Vercel KV, Upstash) only if this app ever needs a real guarantee.
 */

export interface RateLimitResult {
  allowed: boolean;
  /** Requests left in the current window. */
  remaining: number;
  /** When the window resets, epoch ms. */
  resetAt: number;
  /** Seconds until reset — for the Retry-After header. */
  retryAfterSeconds: number;
}

interface Window {
  count: number;
  resetAt: number;
}

export interface RateLimiterOptions {
  /** Requests permitted per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Injectable for tests; defaults to Date.now. */
  now?: () => number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  const { limit, windowMs, now = Date.now } = options;
  const windows = new Map<string, Window>();

  return {
    check(key: string): RateLimitResult {
      const current = now();
      const existing = windows.get(key);

      if (!existing || current >= existing.resetAt) {
        // Opportunistic pruning. Without it a long-lived instance accumulates
        // an entry per IP forever, which is a slow memory leak.
        if (windows.size > 5000) {
          for (const [k, w] of windows) {
            if (current >= w.resetAt) windows.delete(k);
          }
        }
        const resetAt = current + windowMs;
        windows.set(key, { count: 1, resetAt });
        return {
          allowed: true,
          remaining: limit - 1,
          resetAt,
          retryAfterSeconds: Math.ceil(windowMs / 1000),
        };
      }

      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - current) / 1000));

      if (existing.count >= limit) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: existing.resetAt,
          retryAfterSeconds,
        };
      }

      existing.count += 1;
      return {
        allowed: true,
        remaining: limit - existing.count,
        resetAt: existing.resetAt,
        retryAfterSeconds,
      };
    },

    /** Test seam. */
    reset() {
      windows.clear();
    },
  };
}

/**
 * Best-effort client identity.
 *
 * Vercel sets `x-forwarded-for`; the client's address is the first entry. This
 * is spoofable in principle, which is fine — the limiter raises the cost of
 * casual abuse, it isn't an authentication boundary.
 *
 * Requests with no forwarded address share a single bucket rather than
 * bypassing the limit, so a missing header can't be used to dodge it.
 */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}
