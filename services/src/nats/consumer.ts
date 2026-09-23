import { consumerOpts } from 'nats';
import { getNats } from '.';
import Redis from 'ioredis';
import { PLAN_REDIS_TTL_SEC, usageRediskey, VERSION } from '../config';
import { clickhouse } from '../clickhouse/client';
import { initNatsStream } from './initStream';
import { broadcastLogs } from '../sse/sseRegistry';
import { usageCache } from '../guards/usage.guard';

const redis = new Redis({
  host: process.env.REDIS_HOST || '',
  port: Number(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || '',
  db: Number(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 5,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) return true;
    return false;
  },
  retryStrategy(times) {
    const delay = Math.min(times * 200, 10000);
    return delay;
  },
});

const importanceMap: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};
let lastBacklogUpdate = 0;

function toImportance(input: any): number | null {
  if (typeof input == 'number') return input;
  if (typeof input === 'string') {
    const v = importanceMap[input.toLowerCase()];
    return v ?? null;
  }
  return null;
}

export async function startLogsConsumer() {
  const { nc, jc } = await getNats();
  await initNatsStream();
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  const durable = 'ulogs-log-worker';
  const subject = 'logs.ingest';
  const streamName = 'ULOGS_LOGS';

  const opts = consumerOpts();
  opts.durable(durable);
  opts.manualAck();
  opts.ackExplicit();
  opts.deliverTo('ulogs.logs.worker');
  try {
    const existing = await jsm.consumers.info(streamName, durable);
    const cfg: any = (existing as any)?.config;
    if (cfg && !cfg.deliver_subject) {
      console.warn(
        `JetStream durable '${durable}' is pull-based (missing deliver_subject). Recreating as push cusumer`,
      );
    }

    await jsm.consumers.delete(streamName, durable);
  } catch (error) {}

  const sub = await js.subscribe(subject, opts);

  console.log('ULOGS Logs Consumer started');
  for await (const msg of sub) {
    try {
      const data = jc.decode(msg.data);
      const { keyId, userId, logs, serverReceivedAt } = data as any;
      const now = Date.now();

      const transformed = logs.map((log: any) => {
        const now = Date.now();
        const latency = now - serverReceivedAt;

        redis.lpush('ingest:latency', latency);
        redis.ltrim('ingest:latency', 0, 59);
        const ts = log?.timestamps?.eventTime
          ? new Date(log.timestamps.eventTime).getTime()
          : Date.now();

        const timestampSeconds = Math.floor(ts / 1000);

        return {
          keyId,
          userId,
          type: log.type,
          message: log.message,
          service: log.service,
          appName: log.appName,
          environment: log.environment,
          importance: toImportance(log.importance),
          subsystem: log.subsystem ?? null,
          operation: log.operation ?? null,
          track: log.track ? JSON.stringify(log.track) : null,
          security: log.security ? JSON.stringify(log.security) : null,
          metrics: log.metrics ? JSON.stringify(log.metrics) : null,
          timestamp: timestampSeconds,
        };
      });
      await clickhouse.insert({
        table: 'logs.events',
        values: transformed,
        format: 'JSONEachRow',
      });
      await js.publish(
        'logs.alert.evaluate',
        jc.encode({
          logs: transformed,
          processedAt: Date.now(),
        }),
      );

      const usageKey = usageRediskey(userId);
      await redis.hincrby(usageKey, 'events_used', transformed.length);
      await redis.expire(usageKey, PLAN_REDIS_TTL_SEC);
      await redis.sadd(`ulogs:usage:dirty:${VERSION}`, userId);
      const lrukey = `usage:${userId}`;
      const cached = usageCache.get(lrukey);

      if (cached) {
        usageCache.set(lrukey, {
          ...cached,
          events_used: cached.events_used + transformed.length,
        });
      }

      broadcastLogs(transformed);

      msg.ack();

      if (now - lastBacklogUpdate > 1000) {
        lastBacklogUpdate = now;

        const info = await jsm.consumers.info(streamName, durable);

        const backlog =
          (info as any)?.num_pending ??
          (info as any)?.num_ack_pending ??
          (info as any)?.numAckPending ??
          0;
        await redis.set('ingest:backlog', backlog);
      }
    } catch (error) {
      console.error('Consumer error', error);
    }
  }
}
