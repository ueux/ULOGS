import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Redis } from 'ioredis';
import { eq } from 'drizzle-orm';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import { DRIZZLE_DB } from '../database/database.module';
import { REDIS_CLIENT } from '../infra/redis.module';
import * as schema from '../database/schema';
import { usageRediskey, VERSION } from '../config';

const USAGE_DIRTY_KEY = `ulogs:usage:dirty:${VERSION}`;

@Injectable()
export class UsageDbSync {
  constructor(
    @Inject(DRIZZLE_DB) private db: NeonDatabase,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Cron('*/5 * * * *')
  async flushUsage() {
    const processingKey = `${USAGE_DIRTY_KEY}:processing:${Date.now()}`;

    const renamed = await this.redis
      .rename(USAGE_DIRTY_KEY, processingKey)
      .catch(() => null);

    if (!renamed) return;

    const userIds = await this.redis.smembers(processingKey);

    for (const userId of userIds) {
      const usage = await this.redis.hgetall(usageRediskey(userId));

      if (!usage || usage.events_used === undefined) continue;

      await this.db
        .update(schema.usage)
        .set({
          events_used: Number(usage.events_used),
          events_limit: Number(usage.events_limit ?? 0),
          updated_at: new Date(),
        })
        .where(eq(schema.usage.user_id, userId));
    }
    await this.redis.del(processingKey);
  }
}
