// In-memory per-IP token bucket for the PART03 imaging API. Best-effort
// abuse guard for a single isolate; not a distributed limiter.

export interface RateLimitOptions {
  capacity: number;
  refillPerSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
}

interface Bucket {
  tokens: number;
  lastMs: number;
}

const buckets = new Map<string, Bucket>();

export const DEFAULT_RATE_LIMIT: RateLimitOptions = { capacity: 60, refillPerSec: 1 };

export function checkRateLimit(ip: string, opts?: Partial<RateLimitOptions>): RateLimitResult {
  const capacity = opts?.capacity ?? DEFAULT_RATE_LIMIT.capacity;
  const refillPerSec = opts?.refillPerSec ?? DEFAULT_RATE_LIMIT.refillPerSec;
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: capacity, lastMs: now };
  const elapsedSec = Math.max(0, (now - bucket.lastMs) / 1000);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedSec * refillPerSec);
  bucket.lastMs = now;
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    buckets.set(ip, bucket);
    return { allowed: true, retryAfterSec: 0 };
  }
  buckets.set(ip, bucket);
  const retryAfterSec = Math.max(1, Math.ceil((1 - bucket.tokens) / refillPerSec));
  return { allowed: false, retryAfterSec };
}

export function resetRateLimitsForTests(): void {
  buckets.clear();
}
