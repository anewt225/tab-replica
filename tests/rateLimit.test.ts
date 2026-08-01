import { describe, it, expect } from "vitest";
import { createRateLimiter, clientKey } from "@/lib/rateLimit";

describe("createRateLimiter", () => {
  it("allows requests up to the limit", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("blocks the request past the limit", () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000, now: () => 0 });
    limiter.check("a");
    limiter.check("a");
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("counts down remaining", () => {
    const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => 0 });
    expect(limiter.check("a").remaining).toBe(2);
    expect(limiter.check("a").remaining).toBe(1);
    expect(limiter.check("a").remaining).toBe(0);
  });

  it("keys are independent — one person's uploads don't limit another's", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    expect(limiter.check("alex").allowed).toBe(true);
    expect(limiter.check("alex").allowed).toBe(false);
    // Bailey, at a different address, is unaffected.
    expect(limiter.check("bailey").allowed).toBe(true);
  });

  it("lets requests through again once the window rolls over", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });

    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);

    clock = 999; // still inside the window
    expect(limiter.check("a").allowed).toBe(false);

    clock = 1000; // window elapsed
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reports a retry delay that never rounds down to zero", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000, now: () => clock });
    limiter.check("a");

    clock = 999; // 1ms left — must still say "1 second", not "0"
    const blocked = limiter.check("a");
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("prunes expired entries so a long-lived instance doesn't leak memory", () => {
    let clock = 0;
    const limiter = createRateLimiter({ limit: 1, windowMs: 100, now: () => clock });

    // Fill past the pruning threshold with entries that will all expire.
    for (let i = 0; i < 5001; i++) limiter.check(`key-${i}`);

    clock = 1000; // everything above is now expired
    // The next check triggers pruning; it must still behave correctly.
    expect(limiter.check("fresh").allowed).toBe(true);
    expect(limiter.check("key-0").allowed).toBe(true);
  });
});

describe("clientKey", () => {
  const req = (headers: Record<string, string>) =>
    new Request("https://example.com", { headers });

  it("takes the client address from x-forwarded-for", () => {
    expect(clientKey(req({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("uses the first entry when proxies have appended their own", () => {
    expect(
      clientKey(req({ "x-forwarded-for": "203.0.113.7, 70.41.3.18, 150.172.238.178" })),
    ).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip", () => {
    expect(clientKey(req({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
  });

  it("shares one bucket when no address is present, rather than bypassing the limit", () => {
    expect(clientKey(req({}))).toBe("unknown");
  });

  it("ignores a blank forwarded header", () => {
    expect(clientKey(req({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});
