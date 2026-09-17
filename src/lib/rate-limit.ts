type Entry = { count: number; resetAt: number };

const buckets = new Map<string, Entry>();
const MAX_BUCKETS = 10_000;

export function checkRateLimit(key: string, limit: number, windowMs: number) {
  if (Math.random() < 0.01) {
    const time = Date.now();
    for (const [k, v] of buckets.entries()) {
      if (v.resetAt <= time) buckets.delete(k);
    }
  }

  const now = Date.now();
  if (buckets.size >= MAX_BUCKETS && !buckets.has(key)) {
    for (const [bucketKey, value] of buckets.entries()) {
      if (value.resetAt <= now || buckets.size >= MAX_BUCKETS) buckets.delete(bucketKey);
      if (buckets.size < MAX_BUCKETS * 0.9) break;
    }
  }
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  current.count += 1;
  if (current.count <= limit) return { allowed: true, retryAfterSeconds: 0 };
  return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}

export function clearRateLimit(key: string) {
  buckets.delete(key);
}
