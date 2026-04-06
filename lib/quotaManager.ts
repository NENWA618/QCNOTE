/**
 * API Quota Management System
 * Prevents abuse and monitors API usage
 */

interface QuotaEntry {
  count: number;
  totalCost: number; // Estimated cost in USD
  resetTime: number;
}

const quotaStore = new Map<string, QuotaEntry>();

// Configuration
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DAILY_SPEND = 10; // $10 per day limit
const OPENAI_COST_PER_1K_TOKENS = 0.002; // Approximate cost for GPT-3.5

interface TokenEstimate {
  inputTokens: number;
  outputTokens: number;
}

/**
 * Estimate token count for a text (rough approximation)
 * 1 token ≈ 4 characters on average
 */
export function estimateTokens(text: string): TokenEstimate {
  const tokenCount = Math.ceil(text.length / 4);
  return {
    inputTokens: tokenCount,
    outputTokens: Math.ceil(tokenCount * 0.5), // Estimate output as 50% of input
  };
}

/**
 * Estimate cost of API call
 */
export function estimateAPICost(tokens: TokenEstimate): number {
  const totalTokens = tokens.inputTokens + tokens.outputTokens;
  return (totalTokens / 1000) * OPENAI_COST_PER_1K_TOKENS;
}

/**
 * Check if request would exceed daily quota
 */
export function checkQuota(clientId: string, estimatedCost: number): boolean {
  const now = Date.now();
  let entry = quotaStore.get(clientId);

  // Initialize or reset if window has expired
  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      totalCost: 0,
      resetTime: now + QUOTA_WINDOW_MS,
    };
    quotaStore.set(clientId, entry);
  }

  // Check if adding this cost would exceed limit
  return (entry.totalCost + estimatedCost) <= MAX_DAILY_SPEND;
}

/**
 * Record API usage
 */
export function recordUsage(clientId: string, cost: number): void {
  const now = Date.now();
  let entry = quotaStore.get(clientId);

  if (!entry || now > entry.resetTime) {
    entry = {
      count: 0,
      totalCost: 0,
      resetTime: now + QUOTA_WINDOW_MS,
    };
  }

  entry.count++;
  entry.totalCost += cost;
  quotaStore.set(clientId, entry);
}

/**
 * Get quota status for a client
 */
export function getQuotaStatus(clientId: string) {
  const now = Date.now();
  const entry = quotaStore.get(clientId);

  if (!entry || now > entry.resetTime) {
    return {
      remaining: MAX_DAILY_SPEND,
      used: 0,
      resetTime: now + QUOTA_WINDOW_MS,
    };
  }

  return {
    remaining: MAX_DAILY_SPEND - entry.totalCost,
    used: entry.totalCost,
    resetTime: entry.resetTime,
    requestCount: entry.count,
  };
}

/**
 * Cleanup expired quota entries
 */
export function startQuotaCleanup(): void {
  setInterval(() => {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [clientId, entry] of quotaStore.entries()) {
      if (now > entry.resetTime + QUOTA_WINDOW_MS) {
        entriesToDelete.push(clientId);
      }
    }

    entriesToDelete.forEach(id => quotaStore.delete(id));

    if (entriesToDelete.length > 0) {
      console.log(`[Quota] Cleaned up ${entriesToDelete.length} expired quota entries`);
    }
  }, QUOTA_WINDOW_MS);
}
