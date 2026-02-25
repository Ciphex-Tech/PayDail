type Entry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Entry>();

export function rateLimitByKey(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1 };
  }

  if (existing.count >= limit) {
    return { ok: false, remaining: 0, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { ok: true, remaining: limit - existing.count };
}
