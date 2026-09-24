import Redis from 'ioredis';
import { getNats } from '.';
import { consumerOpts } from 'nats';
import { db } from '../database/client';
import { alerts } from '../database/schema';
import { desc, eq } from 'drizzle-orm';
import { ALERT_CACHE_TTL_SECONDS } from '../modules/alert/alert.service';
import { randomUUID } from 'crypto';
import crypto from 'crypto';
type AlertCondition = {
  field: string;
  operator: string;
  value: string | number;
};

type WebhookResult = {
  eventId: string;
  status: number;
  delivered: boolean;
};

type AlertRule = {
  id: string;
  user_id: string;
  name: string;
  conditions: AlertCondition[];
  threshold_count: number;
  threshold_window_minutes: number;
  webhook_url: string;
  cooldown_period: string;
  last_triggered: string;
  status: 'active' | 'inactive';
  appName: string;
};

const fieldMap: Record<string, string> = {
  Type: 'type',
  Message: 'message',
  Importance: 'importance',
  'App Name': 'appName',
  Environment: 'environment',
  Service: 'service',
  Subsystem: 'subsystem',
  Operation: 'operation',
};

const importanceMap: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function normalize(v: any) {
  return String(v ?? '').toLowerCase();
}

function matchCondition(log: any, condition: AlertCondition) {
  const logField = fieldMap[condition.field];
  if (!logField) return false;

  const actual = log[logField];
  const expected = condition.value;

  if (condition.field === 'Importance') {
    const expectedImportance =
      typeof expected === 'string'
        ? importanceMap[expected.toLowerCase()]
        : Number(expected);

    if (!expectedImportance) return false;
    if (condition.operator === 'equals') {
      return Number(actual) === expectedImportance;
    }

    if (condition.operator === 'does not equal') {
      return Number(actual) !== expectedImportance;
    }
    return false;
  }
  switch (condition.operator) {
    case 'equals':
      return normalize(actual) === normalize(expected);
    case 'does not equal':
      return normalize(actual) !== normalize(expected);
    default:
      return false;
  }
}
function parseCooldownSeconds(input: string) {
  const amount = Number.parseInt(input, 10);
  if (!Number.isFinite(amount) || amount <= 0) return 300;
  if (input.includes('second')) return amount;
  if (input.includes('minute')) return amount * 60;
  if (input.includes('hour')) return amount * 3600;
  if (input.includes('day')) return amount * 86400;
  return 300;
}

const PRIVATE_HOST_PATTERN =
  /^(localhost|.*\.local|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|\[?::1\]?$)/i;

function assertPublicWebhook(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return !PRIVATE_HOST_PATTERN.test(parsed.hostname);
}

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

async function callWebhook(
  rule: AlertRule,
  matchedLogs: any[],
): Promise<WebhookResult> {
  const eventId = randomUUID();
  const triggeredAt = new Date().toISOString();

  const sample = matchedLogs[0];

  const payloadObject = {
    eventId,
    type: 'alert.triggered',
    alertId: rule.id,
    alertName: rule.name,
    matchedCount: matchedLogs.length,
    sampleLog: sample || null,
    triggeredAt,
  };

  const payload = JSON.stringify(payloadObject);

  const timestamp = Date.now().toString();

  const secret = process.env.WEBHOOK_SIGNING_SECRET;

  if (!secret) {
    throw new Error('WEBHOOK_SIGNING_SECRET is not configured.');
  }
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf-8')
    .digest('hex');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);

  try {
    const response = await fetch(rule.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ULOGS-Webhooks/1.0',
        'x-ulogs-event-id': eventId,
        'x-ulogs-signature': signature,
        'x-ulogs-timestamp': timestamp,
      },
      body: payload,
      signal: controller.signal,
    });
    if (!response.ok) {
      const responseBody = await response.text().catch(() => '');

      console.warn('Webhook delivery failed', {
        alertId: rule.id,
        alertName: rule.name,
        webhookUrl: rule.webhook_url,
        status: response.status,
        response: responseBody.slice(0, 500),
      });

      return { eventId, status: response.status, delivered: false };
    }
    return { eventId, status: response.status, delivered: true };
  } finally {
    clearTimeout(timeout);
  }
}

export async function startAlertConsumer() {
  const { nc, jc } = await getNats();
  const js = nc.jetstream();
  const durable = 'ulogs-alert-worker';
  const subject = 'logs.alert.evaluate';
  const opts = consumerOpts();

  opts.durable(durable);
  opts.manualAck();
  opts.ackExplicit();
  opts.deliverTo('ulogs.alert.worker');
  const subscription = await js.subscribe(subject, opts);
  console.log('ULOGS Alert Consumer started');

  for await (const msg of subscription) {
    try {
      const data = jc.decode(msg.data) as any;
      const { logs } = data;
      const logsByUser = new Map<string, any[]>();

      for (const log of logs) {
        if (!logsByUser.has(log.userId)) logsByUser.set(log.userId, []);
        logsByUser.get(log.userId)!.push(log);
      }

      for (const [userId, userLogs] of logsByUser) {
        const redisKey = `ulogs:alerts:${userId}`;
        let cached = await redis.get(redisKey);
        if (!cached) {
          const userAlerts = await db
            .select()
            .from(alerts)
            .where(eq(alerts.user_id, userId))
            .orderBy(desc(alerts.created_at));
          cached = JSON.stringify(userAlerts);
          await redis.set(
            redisKey,
            cached,
            'EX',
            ALERT_CACHE_TTL_SECONDS,
          );
        }
        const allRules: AlertRule[] = JSON.parse(cached);
        const rules = allRules.filter((r) => r.status === 'active');
        for (const rule of rules) {
          const matchedLogs = userLogs.filter((log) => {
            if (rule.appName && log.appName !== rule.appName) return false;

            return rule.conditions.every((condition) =>
              matchCondition(log, condition),
            );
          });

          if (matchedLogs.length === 0) continue;

          const bucket = Math.floor(
            Date.now() / (rule.threshold_window_minutes * 60 * 1000),
          );
          const counterKey = `ulogs:alert:count:${rule.id}:${bucket}`;
          const cooldownKey = `ulogs:alert:cooldown:${rule.id}`;
          const count = await redis.incrby(counterKey, matchedLogs.length);
          await redis.expire(counterKey, rule.threshold_window_minutes * 60);

          if (count < rule.threshold_count) continue;
          const cooldownExists = await redis.get(cooldownKey);
          if (cooldownExists) continue;

          if (!assertPublicWebhook(rule.webhook_url)) {
            console.warn('Skipping alert with blocked webhook URL', {
              alertId: rule.id,
              webhookUrl: rule.webhook_url,
            });
            continue;
          }

          const triggeredAt = new Date().toISOString();
          let webhookResult: WebhookResult;
          try {
            webhookResult = await callWebhook(rule, matchedLogs);
          } catch (error) {
            console.error('Webhook delivery error', {
              alertId: rule.id,
              error,
            });
            continue;
          }
          if (!webhookResult.delivered) continue;

          await redis.set(
            cooldownKey,
            '1',
            'EX',
            parseCooldownSeconds(rule.cooldown_period),
          );
          await db
            .update(alerts)
            .set({ last_triggered: new Date(triggeredAt) })
            .where(eq(alerts.id, rule.id));
          await redis.del(redisKey);
        }
      }
      msg.ack();
    } catch (error) {
      console.error('Alert consumer error', error);
      msg.ack();
    }
  }
}
