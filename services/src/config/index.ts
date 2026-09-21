export const VERSION = 'v1';
export type CachedKey = {
  userId: string;
  apiKeyDigest: string;
  expiresAt: number;
};
export const LAST_USED_HASH = `ulogs:api_key:last_used:${VERSION}`;
export const LAST_USED_DEBOUNCE_SEC = 60;
export const LRU_SOFT_TTL_MS = 5 * 60 * 1000;
export const REDIS_HARD_TTL = 10 * 60;
export const MAX_LIMIT = 500;

export const PLAN_LRU_TTL_MS = 5 * 60 * 1000;
export const PLAN_REDIS_TTL_SEC = 6 * 60;

export const hardLockedRedisKey = (userId: string) => `user:${userId}:locked`;
export const planRedisKey = (userId: string) =>
  `ulogs:plan:${VERSION}:${userId}`;
export const usageRediskey = (userId: string) =>
  `ulogs:usage:${VERSION}:${userId}`;

export enum PlanTier {
  FREE = 'free',
  STARTER = 'starter',
  PRO = 'pro',
  BUSINESS = 'business',
}

export const PLAN_DEFAULTS: Record<PlanTier, { events_limit: number }> = {
  [PlanTier.FREE]: { events_limit: 10000 },
  [PlanTier.STARTER]: { events_limit: 100000 },
  [PlanTier.PRO]: { events_limit: 500000 },
  [PlanTier.BUSINESS]: { events_limit: 1000000 },
};

export function normalizePlanTier(raw: string | undefined | null): PlanTier {
  const lower = raw?.toLowerCase();
  if (Object.values(PlanTier).includes(lower as PlanTier)) {
    return lower as PlanTier;
  }
  return PlanTier.FREE;
}
