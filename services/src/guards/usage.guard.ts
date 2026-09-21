import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../database/database.module';
import { REDIS_CLIENT } from '../infra/redis.module';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import Redis from 'ioredis';
import * as schema from '../database/schema';
import {
  hardLockedRedisKey,
  normalizePlanTier,
  PLAN_DEFAULTS,
  PLAN_LRU_TTL_MS,
  PLAN_REDIS_TTL_SEC,
  planRedisKey,
  PlanTier,
  usageRediskey,
} from '../config';
import { LRUCache } from 'lru-cache';
import { eq } from 'drizzle-orm';

export type CachedUsage = {
  events_used: number;
  events_limit: number;
};

export type CachedPlan = {
  name: PlanTier;
};

export const planCache = new LRUCache<string, CachedPlan>({
  max: 50_000,
  ttl: PLAN_LRU_TTL_MS,
  updateAgeOnGet: true,
  allowStale: false,
});

export const usageCache = new LRUCache<string, CachedUsage>({
  max: 50_000,
  ttl: PLAN_LRU_TTL_MS,
  updateAgeOnGet: true,
  allowStale: false,
});

@Injectable()
export class UsageGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE_DB) private db: NeonDatabase,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}
  private async isHardLocked(userId: string): Promise<boolean> {
    return (await this.redis.exists(hardLockedRedisKey(userId))) === 1;
  }
  private async resolvePlan(userId: string): Promise<CachedPlan> {
    const lrukey = `plan:${userId}`;
    const cached = planCache.get(lrukey);
    if (cached) return cached;

    const rKey = planRedisKey(userId);
    const rPlan = await this.redis.hgetall(rKey);
    if (rPlan?.name) {
      void this.redis.expire(rKey, PLAN_REDIS_TTL_SEC);
      const entry: CachedPlan = { name: normalizePlanTier(rPlan.name) };
      planCache.set(lrukey, entry);
      return entry;
    }
    const [record] = await this.db
      .select({ name: schema.plan.name })
      .from(schema.plan)
      .where(eq(schema.plan.user_id, userId))
      .limit(1);

    const planName = normalizePlanTier(record?.name);
    const entry: CachedPlan = { name: planName };
    await this.redis.hset(rKey, { name: planName });
    await this.redis.expire(rKey, PLAN_REDIS_TTL_SEC);
    planCache.set(lrukey, entry);

    return entry;
  }
  private async getOrCreateUsage(
    userId: string,
    planDefaults: { events_limit: number },
  ): Promise<CachedUsage> {
    const lruKey = `usage:${userId}`;
    const cached = usageCache.get(lruKey);
    if (cached) return cached;

    const rKey = usageRediskey(userId);
    const rUsage = await this.redis.hgetall(rKey);
    if (rUsage?.events_used !== undefined) {
      void this.redis.expire(rKey, PLAN_REDIS_TTL_SEC);
      const entry: CachedUsage = {
        events_used: Number(rUsage.events_used),
        events_limit: Number(rUsage.events_limit),
      };
      usageCache.set(lruKey, entry);
      return entry;
    }
    const [record] = await this.db
      .select({
        events_used: schema.usage.events_used,
        events_limit: schema.usage.events_limit,
      })
      .from(schema.usage)
      .where(eq(schema.usage.user_id, userId))
      .limit(1);
    if (!record) {
      const entry = {
        events_used: 0,
        events_limit: PLAN_DEFAULTS[PlanTier.FREE].events_limit,
      };
      await this.db
        .insert(schema.usage)
        .values({
          user_id: userId,
          events_used: 0,
          events_limit: PLAN_DEFAULTS[PlanTier.FREE].events_limit,
        })
        .onConflictDoNothing();
      await this.redis.hset(rKey, {
        events_used: entry.events_used.toString(),
        events_limit: entry.events_limit.toString(),
      });
      await this.redis.expire(rKey, PLAN_REDIS_TTL_SEC);
      usageCache.set(lruKey, entry);
      return entry;
    }
    const entry: CachedUsage = {
      events_used: record?.events_used ?? 0,
      events_limit: record?.events_limit ?? 0,
    };
    await this.redis.hset(rKey, {
      events_used: entry.events_used.toString(),
      events_limit: entry.events_limit.toString(),
    });
    await this.redis.expire(rKey, PLAN_REDIS_TTL_SEC);
    usageCache.set(lruKey, entry);
    return entry;
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Unauthorized!');
    }
    if (await this.isHardLocked(userId)) {
      throw new ForbiddenException(
        'Your account has been locked. You have exceeded the usage limit for your current plan' +
          'Please upgrade your OneMinute Logs account plan to continue uploading.',
      );
    }
    const plan = await this.resolvePlan(userId);
    request.plan = plan.name;
    const planDefaults =
      PLAN_DEFAULTS[plan.name] ?? PLAN_DEFAULTS[PlanTier.FREE];

    const usage = await this.getOrCreateUsage(userId, planDefaults);

    const effectiveUsageLimit =
      usage.events_limit > 0 ? usage.events_limit : planDefaults.events_limit;

    if (usage.events_used >= effectiveUsageLimit) {
      throw new ForbiddenException(
        'You have reached your usage quota. Please upgrade your ULogs Acount plan',
      );
    }
    return true;
  }
}
