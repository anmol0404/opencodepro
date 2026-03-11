import { dbService } from '../../service/db/DBService';

export interface KeyLimits {
  rate_limit_rpm: number | null;
  rate_limit_rph: number | null;
  rate_limit_rpd: number | null;
  max_lifetime_requests: number | null;
  monthly_token_limit: number | null;
  monthly_cost_limit_usd: number | null;
}

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  retryAfter?: number;
  statusCode?: number; // 429 for rate limit, 403 for budget/lifetime
}

interface SlidingWindow {
  minute: number[];
  hour: number[];
  day: number[];
}

interface MonthlyUsage {
  tokens: number;
  costUsd: number;
  requests: number;
  fetchedAt: number;
}

interface LifetimeUsage {
  count: number;
  fetchedAt: number;
}

const MONTHLY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const LIFETIME_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const ONE_MINUTE = 60 * 1000;
const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * 60 * 60 * 1000;

// Sliding window timestamps per key
const slidingWindows = new Map<number, SlidingWindow>();

// Cached monthly usage per key
const monthlyCache = new Map<number, MonthlyUsage>();

// Cached lifetime count per key
const lifetimeCache = new Map<number, LifetimeUsage>();

function getWindow(keyId: number): SlidingWindow {
  let window = slidingWindows.get(keyId);
  if (!window) {
    window = { minute: [], hour: [], day: [] };
    slidingWindows.set(keyId, window);
  }
  return window;
}

function pruneTimestamps(timestamps: number[], maxAge: number): number[] {
  const cutoff = Date.now() - maxAge;
  // Find first index >= cutoff using linear scan (arrays are small due to rate limits)
  let i = 0;
  while (i < timestamps.length && timestamps[i] < cutoff) i++;
  return i > 0 ? timestamps.slice(i) : timestamps;
}

function getMonthStart(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
}

async function fetchMonthlyUsage(keyId: number): Promise<MonthlyUsage> {
  const cached = monthlyCache.get(keyId);
  if (cached && Date.now() - cached.fetchedAt < MONTHLY_CACHE_TTL) {
    return cached;
  }

  const monthStart = getMonthStart();
  const row = await dbService.get<any>(
    `SELECT COUNT(*) as requests,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
            COALESCE(SUM(cost_usd), 0) as cost_usd
     FROM request_logs
     WHERE wrapper_key_id = ? AND timestamp >= ?`,
    [keyId, monthStart]
  );

  const usage: MonthlyUsage = {
    requests: row?.requests || 0,
    tokens: row?.tokens || 0,
    costUsd: row?.cost_usd || 0,
    fetchedAt: Date.now(),
  };

  monthlyCache.set(keyId, usage);
  return usage;
}

async function fetchLifetimeCount(keyId: number): Promise<LifetimeUsage> {
  const cached = lifetimeCache.get(keyId);
  if (cached && Date.now() - cached.fetchedAt < LIFETIME_CACHE_TTL) {
    return cached;
  }

  const row = await dbService.get<any>(
    'SELECT COUNT(*) as count FROM request_logs WHERE wrapper_key_id = ?',
    [keyId]
  );

  const usage: LifetimeUsage = {
    count: row?.count || 0,
    fetchedAt: Date.now(),
  };

  lifetimeCache.set(keyId, usage);
  return usage;
}

export async function checkKeyLimits(keyId: number, limits: KeyLimits): Promise<LimitCheckResult> {
  const now = Date.now();

  // --- Rate Limits (sliding window) ---
  const window = getWindow(keyId);

  if (limits.rate_limit_rpm !== null) {
    const pruned = pruneTimestamps(window.minute, ONE_MINUTE);
    window.minute = pruned;
    if (pruned.length >= limits.rate_limit_rpm) {
      const oldestInWindow = pruned[0];
      const retryAfter = Math.ceil((oldestInWindow + ONE_MINUTE - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.rate_limit_rpm} requests per minute`,
        retryAfter: Math.max(1, retryAfter),
        statusCode: 429,
      };
    }
  }

  if (limits.rate_limit_rph !== null) {
    const pruned = pruneTimestamps(window.hour, ONE_HOUR);
    window.hour = pruned;
    if (pruned.length >= limits.rate_limit_rph) {
      const oldestInWindow = pruned[0];
      const retryAfter = Math.ceil((oldestInWindow + ONE_HOUR - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.rate_limit_rph} requests per hour`,
        retryAfter: Math.max(1, retryAfter),
        statusCode: 429,
      };
    }
  }

  if (limits.rate_limit_rpd !== null) {
    const pruned = pruneTimestamps(window.day, ONE_DAY);
    window.day = pruned;
    if (pruned.length >= limits.rate_limit_rpd) {
      const oldestInWindow = pruned[0];
      const retryAfter = Math.ceil((oldestInWindow + ONE_DAY - now) / 1000);
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${limits.rate_limit_rpd} requests per day`,
        retryAfter: Math.max(1, retryAfter),
        statusCode: 429,
      };
    }
  }

  // --- Lifetime cap ---
  if (limits.max_lifetime_requests !== null) {
    const lifetime = await fetchLifetimeCount(keyId);
    if (lifetime.count >= limits.max_lifetime_requests) {
      return {
        allowed: false,
        reason: `Lifetime request cap exceeded: ${limits.max_lifetime_requests} total requests`,
        statusCode: 403,
      };
    }
  }

  // --- Monthly budget ---
  if (limits.monthly_token_limit !== null || limits.monthly_cost_limit_usd !== null) {
    const monthly = await fetchMonthlyUsage(keyId);

    if (limits.monthly_token_limit !== null && monthly.tokens >= limits.monthly_token_limit) {
      return {
        allowed: false,
        reason: `Monthly token limit exceeded: ${limits.monthly_token_limit} tokens`,
        statusCode: 403,
      };
    }

    if (limits.monthly_cost_limit_usd !== null && monthly.costUsd >= limits.monthly_cost_limit_usd) {
      return {
        allowed: false,
        reason: `Monthly cost budget exceeded: $${limits.monthly_cost_limit_usd.toFixed(2)} USD`,
        statusCode: 403,
      };
    }
  }

  return { allowed: true };
}

/**
 * Record a completed request for a key. Called after the response is sent.
 * Updates in-memory sliding windows and cached counters so subsequent
 * limit checks are accurate without hitting the DB.
 */
export function recordKeyRequest(keyId: number | null, tokens: number, cost: number): void {
  if (keyId === null) return; // Admin session, no tracking

  const now = Date.now();

  // Update sliding windows
  const window = getWindow(keyId);
  window.minute.push(now);
  window.hour.push(now);
  window.day.push(now);

  // Update monthly cache (increment in-memory)
  const monthly = monthlyCache.get(keyId);
  if (monthly) {
    monthly.requests += 1;
    monthly.tokens += tokens;
    monthly.costUsd += cost;
  }

  // Update lifetime cache (increment in-memory)
  const lifetime = lifetimeCache.get(keyId);
  if (lifetime) {
    lifetime.count += 1;
  }
}

/**
 * Invalidate all cached data for a key (called when limits are updated).
 */
export function invalidateKeyCache(keyId: number): void {
  slidingWindows.delete(keyId);
  monthlyCache.delete(keyId);
  lifetimeCache.delete(keyId);
}

/**
 * Get current usage stats for a key (for the /api/keys/:id/usage endpoint).
 */
export async function getKeyUsageStats(keyId: number): Promise<{
  lifetime_requests: number;
  month_requests: number;
  month_tokens: number;
  month_cost_usd: number;
}> {
  const monthStart = getMonthStart();

  const lifetimeRow = await dbService.get<any>(
    'SELECT COUNT(*) as count FROM request_logs WHERE wrapper_key_id = ?',
    [keyId]
  );

  const monthlyRow = await dbService.get<any>(
    `SELECT COUNT(*) as requests,
            COALESCE(SUM(prompt_tokens + completion_tokens), 0) as tokens,
            COALESCE(SUM(cost_usd), 0) as cost_usd
     FROM request_logs
     WHERE wrapper_key_id = ? AND timestamp >= ?`,
    [keyId, monthStart]
  );

  return {
    lifetime_requests: lifetimeRow?.count || 0,
    month_requests: monthlyRow?.requests || 0,
    month_tokens: monthlyRow?.tokens || 0,
    month_cost_usd: monthlyRow?.cost_usd || 0,
  };
}
