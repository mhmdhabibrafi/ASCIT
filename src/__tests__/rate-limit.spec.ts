import { checkRateLimit, clearRateLimit } from "@/lib/rate-limit";

describe("in-memory rate limiter", () => {
  it("menolak permintaan setelah batas tercapai", () => {
    const key = `test-rate-limit:${Date.now()}:${Math.random()}`;

    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    const blocked = checkRateLimit(key, 2, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);

    clearRateLimit(key);
  });

  it("dapat mereset bucket setelah login berhasil", () => {
    const key = `test-rate-limit-reset:${Date.now()}:${Math.random()}`;

    expect(checkRateLimit(key, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 60_000).allowed).toBe(false);
    clearRateLimit(key);
    expect(checkRateLimit(key, 1, 60_000).allowed).toBe(true);

    clearRateLimit(key);
  });
});
