import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { REDIS_CLIENT } from '../../infra/redis.module';
import Redis from 'ioredis';
import { and, count, eq, isNull } from 'drizzle-orm';
import { api_key } from '../../database/schema';
import { randomBytes, randomUUID } from 'crypto';
import agron2 from 'argon2';
import { LRUCache } from 'lru-cache';
import { CachedKey, LAST_USED_HASH, VERSION } from '../../config';

const localCache = new LRUCache<string, CachedKey>({ max: 100_000 });

@Injectable()
export class APIKeyService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}
  private generatekey(): { plaintextKey: string; keyId: string } {
    const keyId = randomUUID().replace(/-/g, '');
    const secret = randomBytes(32).toString('base64url');
    const plaintextKey = `ULOG_${keyId}_${secret}`;
    return { plaintextKey, keyId };
  }
  async createApiKey(userId: string) {
    const [result] = await this.db
      .select({ count: count() })
      .from(api_key)
      .where(and(eq(api_key.user_id, userId), isNull(api_key.revoked_at)));
    if (result.count >= 5) {
      throw new BadRequestException(
        'You have reached the maximum limit of 5 API keys.',
      );
    }
    const { plaintextKey, keyId } = this.generatekey();
    const hash = await agron2.hash(plaintextKey, {
      type: agron2.argon2id,
      timeCost: 3,
      memoryCost: 1 << 16,
      parallelism: 1,
    });
    const prefix = plaintextKey.substring(0, 18) + ' ... ';

    await this.db.insert(api_key).values({
      id: keyId,
      user_id: userId,
      value: hash,
      prefix: prefix,
    });
    return { key: plaintextKey };
  }
  async listApiKeys(userId: string) {
    return this.db
      .select({
        id: api_key.id,
        prefix: api_key.prefix,
        created_at: api_key.created_at,
        last_used_at: api_key.last_used_at,
        revoked_at: api_key.revoked_at,
      })
      .from(api_key)
      .where(and(eq(api_key.user_id, userId)));
  }
  async deleteApiKey(userId: string, keyId: string) {
    await this.db
      .update(api_key)
      .set({ revoked_at: new Date() })
      .where(and(eq(api_key.user_id, userId), eq(api_key.id, keyId)));
    await this.redis.del(`ulogs:api_key:${VERSION}:${keyId}`);
    localCache.delete(`${VERSION}:${keyId}`);
  }
  async regenerateApiKey(userId: string, keyId: string) {
    const { plaintextKey, keyId: newKeyId } = this.generatekey();
    const hash = await agron2.hash(plaintextKey, {
      type: agron2.argon2id,
      timeCost: 3,
      memoryCost: 1 << 16,
      parallelism: 1,
    });
    const prefix = plaintextKey.substring(0, 18) + ' ... ';
    await this.db
      .update(api_key)
      .set({
        value: hash,
        prefix: prefix,
        id: newKeyId,
        created_at: new Date(),
        last_used_at: new Date(),
      })
      .where(and(eq(api_key.id, keyId), eq(api_key.user_id, userId)));
    await this.redis.del(`ulogs:api_key:${VERSION}:${keyId}`);
    localCache.delete(`${VERSION}:${keyId}`);
    return { key: plaintextKey };
  }
  async getApiKeyLastUsed(keyId: string) {
    const normalizedKey = keyId.replace(/-/g, '');
    const redisValue = await this.redis.hget(LAST_USED_HASH, normalizedKey);

    if (redisValue) {
      return { last_used_at: new Date(Number(redisValue)) };
    }

    const [record] = await this.db
      .select({ last_used_at: api_key.last_used_at })
      .from(api_key)
      .where(eq(api_key.id, keyId))
      .limit(1);
    return { last_used_at: record?.last_used_at ?? null };
  }
}
