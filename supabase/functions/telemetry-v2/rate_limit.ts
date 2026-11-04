/**
 * Bounded per-isolate admission control for the telemetry collector.
 *
 * This is deliberately independent from PostgreSQL: an overloaded database
 * must not be queried once for every incoming event just to decide whether
 * the next event may be written. It is a burst guard, not a globally shared
 * quota. The ASF proxy keeps its own independent rate limiting.
 */
export type LocalRateLimiter = (
  key: string,
  limit: number,
  windowSeconds?: number,
) => boolean;

export function createLocalRateLimiter(
  maxEntries = 5000,
  clock: () => number = () => Date.now(),
): LocalRateLimiter {
  const buckets = new Map<string, { startedAt: number; hits: number; windowMs: number }>();
  const capacity = Math.max(100, Math.floor(maxEntries));

  return (key, limit, windowSeconds = 60): boolean => {
    const normalizedKey = String(key || "");
    const maxHits = Math.max(1, Math.floor(Number(limit) || 1));
    const windowMs = Math.max(1000, Math.floor(Number(windowSeconds) || 60) * 1000);
    if (!normalizedKey) return false;

    const now = clock();
    let bucket = buckets.get(normalizedKey);

    if (
      !bucket ||
      now < bucket.startedAt ||
      now - bucket.startedAt >= bucket.windowMs
    ) {
      bucket = { startedAt: now, hits: 0, windowMs };
    }

    if (bucket.hits >= maxHits) {
      buckets.set(normalizedKey, bucket);
      return false;
    }

    bucket.hits += 1;
    buckets.set(normalizedKey, bucket);

    if (buckets.size > capacity) {
      for (const [candidate, value] of buckets) {
        if (now < value.startedAt || now - value.startedAt >= value.windowMs) {
          buckets.delete(candidate);
        }
      }
      while (buckets.size > capacity) {
        const oldest = buckets.keys().next().value;
        if (oldest === undefined) break;
        buckets.delete(oldest);
      }
    }

    return true;
  };
}
