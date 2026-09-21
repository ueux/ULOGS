import { Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB } from '../src/database/database.module';
import { REDIS_CLIENT } from '../src/infra/redis.module';
import { NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from '../src/database/schema';
import { Cron } from '@nestjs/schedule';
import { usageRediskey, VERSION } from '../src/config';
import Redis from 'ioredis';
import { eq } from 'drizzle-orm';

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
    let synedUsers = 0;

    for (const userId of userIds) {
      const usage = await this.redis.hgetall(usageRediskey(userId));

      if (!usage.events_used) continue;

      await this.db
        .update(schema.usage)
        .set({
          events_used: Number(usage.events_used),
          events_limit: Number(usage.events_limit),
        })
        .where(eq(schema.usage.user_id, userId));
      synedUsers += 1;
    }
    await this.redis.del(processingKey);
  }
}
