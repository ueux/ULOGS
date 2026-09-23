import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { DRIZZLE_DB } from '../../database/database.module';
import { REDIS_CLIENT } from '../../infra/redis.module';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { alerts } from '../../database/schema';
import { count, desc, eq } from 'drizzle-orm';
import crypto from 'crypto';

type AlertCondition = {
  field: string;
  operator: string;
  value: string;
};
type CreateAlertPayload = {
  name: string;
  appName: string;
  conditions: AlertCondition[];
  threshold: {
    count: number;
    windowMinutes: number;
  };
  webhook: {
    url: string;
  };
  cooldownPeriod: string;
  summary: string;
};

const ALLOWED_FIELDS = new Set([
  'Type',
  'Message',
  'Importance',
  'Evironment',
  'Service',
  'Subsystem',
  'Operation',
]);

const ALLOWED_OPERATORS = new Set(['equals', 'does not equal']);

const ALLOWED_IMPORTANCE_VALUES = new Set([
  'critical',
  'high',
  'medium',
  'low',
]);

const WEBHOOK_VERIFICATION_TTL_SECONDS = 15 * 60;

@Injectable()
export class AlertService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {}
  async createAlert(userPlan, userId: string, payload: CreateAlertPayload) {
    if (userPlan === 'free') {
      throw new UnauthorizedException(
        `Alerts are not included in the ${userPlan} plan. Upgrade your plan to use Alerts!`,
      );
    }
    const [result] = await this.db
      .select({ value: count() })
      .from(alerts)
      .where(eq(alerts.user_id, userId));
    const alertsCount = result.value;

    if (userPlan === 'starter') {
      if (alertsCount >= 5) {
        throw new UnauthorizedException(
          `Tou've reached the 5-alerts limit for the ${userPlan} plan.`,
        );
      }
    }
    if (userPlan === 'pro') {
      if (alertsCount >= 12) {
        throw new UnauthorizedException(
          `Tou've reached the 12-alerts limit for the ${userPlan} plan.`,
        );
      }
    }
    if (userPlan === 'business') {
      if (alertsCount >= 20) {
        throw new UnauthorizedException(
          `Tou've reached the 20-alerts limit for the ${userPlan} plan.`,
        );
      }
    }
    this.validateCreateAlertPayload(payload);
    const webhookUrl = payload.webhook.url.trim();
    const [createdAlert] = await this.db
      .insert(alerts)
      .values({
        user_id: userId,
        name: payload.name.trim(),
        appName: payload.appName.trim(),
        conditions: payload.conditions.map((condition) => ({
          field: condition.field,
          operator: condition.operator,
          value: condition.value.trim(),
        })),
        threshold_count: payload.threshold.count,
        threshold_window_minutes: payload.threshold.windowMinutes,
        webhook_url: webhookUrl,
        cooldown_period: payload.cooldownPeriod,
        summary: payload.summary,
      })
      .returning();
    await this.redis.del(`ulogs:alerts:${userId}`);
    return createdAlert;
  }
  private validateCreateAlertPayload(payload: CreateAlertPayload) {
    if (!payload || typeof payload !== 'object') {
      throw new BadRequestException('Alert payload is required');
    }
    if (!payload.name?.trim()) {
      throw new BadRequestException('Alert name is required');
    }
    if (!Array.isArray(payload.conditions) || payload.conditions.length === 0) {
      throw new BadRequestException('At leat one condition is required');
    }
    for (const condition of payload.conditions) {
      if (!ALLOWED_FIELDS.has(condition.field)) {
        throw new BadRequestException(
          `Unsupported alert field: ${condition.field}`,
        );
      }
      if (!ALLOWED_OPERATORS.has(condition.operator)) {
        throw new BadRequestException(
          `Unsupported alert field: ${condition.field}`,
        );
      }
      if (!condition.value?.trim()) {
        throw new BadRequestException(`Condition value is required`);
      }
      if (
        condition.field === 'Importance' &&
        !ALLOWED_IMPORTANCE_VALUES.has(condition.value)
      ) {
        throw new BadRequestException(
          'Importance must be critical, high, medium, or low',
        );
      }
    }
    if (
      !Number.isInteger(payload.threshold?.count) ||
      payload.threshold.count < 1
    ) {
      throw new BadRequestException('Threshold count must be at least 1');
    }
    if (
      !Number.isInteger(payload.threshold?.windowMinutes) ||
      payload.threshold.windowMinutes < 1
    ) {
      throw new BadRequestException(
        'Threshold window must be at least 1 minute',
      );
    }
    if (!payload.webhook?.url?.trim()) {
      throw new BadRequestException('Webhook URL is required');
    }
    try {
      new URL(payload.webhook.url);
    } catch {
      throw new BadRequestException('Webhook URL must be a valid URL');
    }
    if (!payload.cooldownPeriod?.trim()) {
      throw new BadRequestException('Cooldown period is required');
    }
    if (!payload.summary?.trim()) {
      throw new BadRequestException('Alert summary is required');
    }
  }
  async listAlerts(userId: string) {
    const cacheKey = `ulogs:alerts:${userId}`;
    const cachedAlerts = await this.redis.get(cacheKey);

    if (cachedAlerts) {
      return JSON.parse(cachedAlerts);
    }
    const userAlerts = await this.db
      .select()
      .from(alerts)
      .where(eq(alerts.user_id, userId))
      .orderBy(desc(alerts.created_at));

    await this.redis.set(cacheKey, JSON.stringify(userAlerts));
    return userAlerts;
  }
  async verifyWebhook({
    plan,
    signature,
    timestamp,
    body,
  }: {
    plan: string;
    signature: string;
    timestamp: string;
    body: unknown;
  }) {
    if (plan === 'free') {
      throw new UnauthorizedException(
        `Alerts are not included in the ${plan} plan. Upgrade your plan`,
      );
    }
    if (!signature || !timestamp) {
      throw new BadRequestException('Missing webhook signature or timestamp.');
    }

    const ts = Number(timestamp);

    if (!Number.isFinite(ts)) {
      throw new BadRequestException('Invalid webhook timestamp.');
    }

    const payload = typeof body === 'string' ? body : JSON.stringify(body);
    const signedPayload = `${timestamp}.${payload}`;

    const secret =
      (await this.configService.get('WEBHOOK_SIGNING_SECRET')) || '';
    if (!secret) {
      throw new InternalServerErrorException(
        'Webhook signing secret is not configured.',
      );
    }
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const received = Buffer.from(signature, 'hex');
    const expected = Buffer.from(expectedSignature, 'hex');

    if (
      received.length !== expected.length ||
      !crypto.timingSafeEqual(received, expected)
    ) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }
  }
}
