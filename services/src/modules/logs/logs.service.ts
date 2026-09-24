import {
  BadRequestException,
  Inject,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Response } from 'express';
import Redis from 'ioredis';
import { publishLogBatch } from '../../nats/producer';
import { clickhouse } from '../../clickhouse/client';
import { addClient } from '../../sse/sseRegistry';
import { LRUCache } from 'lru-cache';
import { MAX_LIMIT } from '../../config';
import { REDIS_CLIENT } from '../../infra/redis.module';

const queryCooldown = new LRUCache<string, number>({ max: 50_000 });
const resultCache = new LRUCache<
  string,
  { rows: any[]; totalCount: number; ts: number }
>({ max: 20_000 });

const LOG_BATCH_LIMITS = {
  free: { maxLogs: 100, maxBytes: 100_000 },
  starter: { maxLogs: 500, maxBytes: 500_000 },
  pro: { maxLogs: 2_000, maxBytes: 1_500_000 },
  business: { maxLogs: 5_000, maxBytes: 2_000_000 },
} as const;

type LogBatchPlan = keyof typeof LOG_BATCH_LIMITS;

@Injectable()
export class LogsService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async sendLogs(body: any, keyId: string, userId: string, userPlan: string) {
    const serverReceivedAt = Date.now();
    const logs = body.logs;
    if (!Array.isArray(logs)) {
      throw new BadRequestException('Logs must be an array.');
    }
    const limits = this.getLogBatchLimits(userPlan);
    const logsSizeBytes = Buffer.byteLength(JSON.stringify(logs), 'utf8');
    if (logs.length > limits.maxLogs) {
      throw new BadRequestException('Too many logs in one batch');
    }
    if (logsSizeBytes > limits.maxBytes) {
      throw new PayloadTooLargeException('Log batch exceeds maximum size.');
    }
    await publishLogBatch(keyId, userId, logs, serverReceivedAt);
    return { message: 'OK' };
  }

  private getLogBatchLimits(userPlan: string) {
    return LOG_BATCH_LIMITS[userPlan as LogBatchPlan] ?? LOG_BATCH_LIMITS.free;
  }

  async startSSE(req: any, res: Response) {
    const userId = req.user.id;

    const limit = Number(req.query.limit) || 500;
    const type = req.query.type as string | undefined;
    const env = req.query.env as string | undefined;
    const appName = req.query.appName as string | undefined;
    const search = req.query.search as string | undefined;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const conditions = [`userId = {userId:String} `];
    if (type) conditions.push(`type={type:String}`);
    if (env) conditions.push(`environment = {env:String} `);
    if (appName) conditions.push(`appName = {appName:String}`);
    if (search) conditions.push(`message ILIKE {search:String}`);

    const query = `SELECT *
                    FROM logs.events
                    WHERE ${conditions.join(' AND ')}
                    ORDER BY timestamp DESC
                    LIMIT {limit:UInt32}
                    `;
    const rs = await clickhouse.query({
      query,
      format: 'JSONEachRow',
      query_params: {
        userId,
        type,
        env,
        appName,
        search: search ? `%${search}%` : search,
        limit,
      },
    });
    const initialRows = await rs.json();
    res.write(
      `data:${JSON.stringify({
        type: 'initial',
        logs: initialRows.reverse(),
      })}\n\n`,
    );
    const removeClient = addClient(res, { userId, type, env, appName, search });
    req.on('close', () => {
      removeClient();
    });
  }
  private parseFilters(queryObj: any) {
    const filters: {
      limit?: number;
      type?: string;
      env?: string;
      appName?: string;
      search?: string;
      range?: string;
      from?: string;
      to?: string;
    } = {};
    const raw = queryObj.query as string | undefined;

    if (raw) {
      const parts = raw.split(/[&, \s]+/);
      for (const p of parts) {
        const [k, v] = p.split(':');

        if (!k || v === undefined) continue;
        const key = k.trim();
        const val = v.trim();
        if (key === 'type') filters.type = val;
        else if (key === 'env' || key === 'environment') filters.env = val;
        else if (key === 'app' || key === 'appName') filters.appName = val;
        else if (key === 'search') filters.search = val;
        else if (key === 'limit') filters.limit = Number(val);
        else if (key === 'range') filters.range = val;
        else if (key === 'from') filters.from = val;
        else if (key === 'to') filters.to = val;
      }
    }
    if (queryObj.type) filters.type = String(queryObj.type);
    if (queryObj.env) filters.env = String(queryObj.env);
    if (queryObj.appName) filters.appName = String(queryObj.appName);
    if (queryObj.search) filters.search = String(queryObj.search);
    if (queryObj.range) filters.range = String(queryObj.range);
    if (queryObj.from) filters.from = String(queryObj.from);
    if (queryObj.to) filters.to = String(queryObj.to);
    if (queryObj.limit) filters.limit = Number(queryObj.limit);

    return filters;
  }
  private buildCacheKey(userId: string, filters: any) {
    return `${userId}:${JSON.stringify(filters)}`;
  }
  private isCoolingDown(userId: string) {
    const now = Date.now();
    const last = queryCooldown.get(userId);
    if (last && now - last < 2000) return true;
    queryCooldown.set(userId, now);
    return false;
  }
  async getLogs(req: any) {
    const userId = req.user.id;

    const parsed: any = this.parseFilters(req.query);

    let limit = parsed.limit ?? 100;
    if (limit > MAX_LIMIT) limit = MAX_LIMIT;
    if (limit < 1) limit = 1;

    let timestampFrom: number | undefined;
    let timestampTo: number | undefined;

    if (parsed.range) {
      const match = parsed.range.match(/^(\d+)([smhd])$/);
      if (match) {
        const value = Number(match[1]);
        const unit = match[2];

        const nowSec = Math.floor(Date.now() / 1000);

        const seconds = {
          s: value,
          m: value * 60,
          h: value * 3600,
          d: value * 86400,
        }[unit];
        timestampFrom = nowSec - seconds;
        timestampTo = nowSec;
      }
    }
    if (parsed.from) {
      const f = Number(parsed.from);
      timestampFrom = f > 2e12 ? Math.floor(f / 1000) : f;
    }
    if (parsed.to) {
      const t = Number(parsed.to);
      timestampTo = t > 2e12 ? Math.floor(t / 1000) : t;
    }
    if (!timestampFrom || !timestampTo) {
      const nowSec = Math.floor(Date.now() / 1000);
      timestampTo = nowSec;
      timestampFrom = nowSec - 20 * 86400;
    }
    const { type, env, appName, search } = parsed;

    if (this.isCoolingDown(userId)) {
      const fallback = resultCache.get(this.buildCacheKey(userId, parsed));

      if (fallback) {
        return {
          fallback: true,
          cached: true,
          count: fallback.rows.length,
          totalCount: fallback.totalCount,
          logs: fallback.rows,
        };
      }
    }
    const filters = {
      limit,
      type,
      env,
      appName,
      search,
      timestampFrom,
      timestampTo,
    };
    const cachedKey = this.buildCacheKey(userId, filters);
    const cached = resultCache.get(cachedKey);
    if (cached && Date.now() - cached.ts < 1000) {
      return {
        cached: true,
        count: cached.rows.length,
        totalCount: cached.totalCount,
        logs: cached.rows,
      };
    }
    const where = [`userId = {userId:String} `];

    if (timestampFrom) where.push(`timestamp >= {from:UInt32} `);
    if (timestampTo) where.push(`timestamp <= {to:UInt32}`);

    if (type) where.push(`type = {type:String}`);
    if (env) where.push(`environment = {env:String}`);
    if (appName) where.push(`appName = {appName:String} `);
    if (search) where.push(`message ILIKE {search:String}`);

    const queryLogs = `
          SELECT *
          FROM logs.events
          WHERE ${where.join(' AND ')}
          ORDER BY timestamp DESC
          LIMIT {limit:UInt32}`;
    const nowSec = Math.floor(Date.now() / 1000);
    const from24h = nowSec - 24 * 60 * 60;
    const to24h = nowSec;

    const where24h = [`userId = {userId:String} `];
    where24h.push(`timestamp > {from24h:UInt32}`);
    where24h.push(`timestamp <= {to24h:UInt32} `);

    const queryCount = `
          SELECT count() AS total
          FROM logs.events
          WHERE ${where24h.join(' AND ')}`;
    const [rsLogs, rsCount] = await Promise.all([
      clickhouse.query({
        query: queryLogs,
        format: 'JSONEachRow',
        query_params: {
          userId,
          type,
          env,
          appName,
          search: search ? `%${search}%` : search,
          from: timestampFrom,
          to: timestampTo,
          limit,
        },
      }),
      clickhouse.query({
        query: queryCount,
        format: 'JSONEachRow',
        query_params: {
          userId,
          from24h,
          to24h,
        },
      }),
    ]);
    const rows = await rsLogs.json();
    const [{ total }] = (await rsCount.json()) as any;

    resultCache.set(cachedKey, {
      rows,
      totalCount: total,
      ts: Date.now(),
    });

    return {
      count: rows.length,
      totalCount: total,
      from: timestampFrom,
      to: timestampTo,
      logs: rows,
    };
  }
  async metricsSSE(req: any, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let lastPayload: any = null; // < store last sent data

    const interval = setInterval(async () => {
      const rate = parseInt(
        (await this.redis.get('ingest:last_rate')) || '0',
        10,
      );
      const backlog = parseInt(
        (await this.redis.get('ingest:backlog')) || '0',
        10,
      );
      const avgLatency = parseInt(
        (await this.redis.get('ingest:avg_latency')) || '0',
        10,
      );
      const payload = {
        ingestRate: rate,
        backlog,
        avgLatency,
      };
      if (
        !lastPayload ||
        JSON.stringify(payload) !== JSON.stringify(lastPayload)
      ) {
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
        lastPayload = payload;
      }
    }, 1000);
    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  }
}
