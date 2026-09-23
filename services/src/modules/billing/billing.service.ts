import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import Stripe from 'stripe';
import { DRIZZLE_DB } from '../../database/database.module';
import { REDIS_CLIENT } from '../../infra/redis.module';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { createClerkClient } from '@clerk/backend';
import { desc, eq } from 'drizzle-orm';
import {
  normalizePlanTier,
  PLAN_DEFAULTS,
  PLAN_REDIS_TTL_SEC,
  planRedisKey,
  PlanTier,
  usageRediskey,
} from '../../config';
import * as schema from '../../database/schema';
import { planCache, usageCache } from '../../guards/usage.guard';

type PaidPlan = 'starter' | 'pro' | 'business';

@Injectable()
export class BillingService {
  private readonly stripe: Stripe;
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: any,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    const stripeSecretKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    this.stripe = new Stripe(stripeSecretKey);
  }
  async getCurrentPlan(req: any) {
    const userPlan = req.plan;
    return { plan: userPlan };
  }

  private isPaidPlan(plan: string): plan is PaidPlan {
    return plan === 'starter' || plan === 'pro' || plan === 'business';
  }
  private getStripePriceId(plan: PaidPlan) {
    const priceIds: Record<PaidPlan, string | undefined> = {
      starter: this.configService.get<string>('STRIPE_STARTER_PRICE_ID'),
      pro: this.configService.get<string>('STRIPE_PRO_PRICE_ID'),
      business: this.configService.get<string>('STRIPE_BUSINESS_PRICE_ID'),
    };
    const priceId = priceIds[plan];
    if (!priceId) {
      throw new InternalServerErrorException(
        `Missing Stripe price id for ${plan}.`,
      );
    }
    return priceId;
  }
  private async getClerkEmail(userId: string) {
    try {
      const clerkClient = createClerkClient({
        secretKey: process.env.CLERK_SECRET_KEY,
      });
      const u: any = await clerkClient.users.getUser(userId);
      const primaryId = u?.primaryEmailAddressId;
      const primary = u?.emailAdddresses?.find((e: any) => e?.id === primaryId);
      return (
        primary?.emailAddress ??
        u?.emailAddresses?.[0]?.emailAddress ??
        undefined
      );
    } catch (error) {
      return undefined;
    }
  }
  private async findStripeCustomerByEmail(email: string) {
    const customers = await this.stripe.customers.list({
      email,
      limit: 1,
    });

    return customers.data[0];
  }
  private async ensureStripeCustomer(userId: string) {
    const email = await this.getClerkEmail(userId);
    if (!email) {
      throw new Error('Missing user email');
    }
    const [record] = await this.db
      .select({
        name: schema.plan.name,
        stripe_customer_id: schema.plan.stripe_customer_id,
      })
      .from(schema.plan)
      .where(eq(schema.plan.user_id, userId));
    const stripeCustomer = await this.findStripeCustomerByEmail(email);
    const currentPlan = normalizePlanTier(record?.name);

    if (stripeCustomer) {
      return {
        customerId: stripeCustomer.id,
        currentPlan,
      };
    }
    const customer = await this.stripe.customers.create({
      email,
      metadata: {
        userId,
      },
    });

    return {
      customerId: customer.id,
      currentPlan,
    };
  }
  async createBillingSession(userId: string, selectedPlan: string) {
    const plan = selectedPlan?.toLowerCase();

    if (!this.isPaidPlan(plan)) {
      throw new BadRequestException(
        'Choose starter, pro, or business to create a billing session.',
      );
    }
    const priceId = this.getStripePriceId(plan);
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3001',
    );

    const { customerId } = await this.ensureStripeCustomer(userId);
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      metadata: {
        userId,
        plan,
      },
      subscription_data: {
        metadata: {
          userId,
          plan,
        },
      },
      success_url: `${appUrl}/settings?checkout=success&plan=${plan}`,
      cancel_url: `${appUrl}/settings?checkout=cancelled`,
    });
    if (!session.url) {
      throw new InternalServerErrorException(
        'Stripe did not return a checkout URL.',
      );
    }

    return {
      url: session.url,
    };
  }
  async createPortalSession(userId: string) {
    const { customerId, currentPlan } = await this.ensureStripeCustomer(userId);
    if (currentPlan === PlanTier.FREE) {
      throw new BadRequestException(
        'Free plan users do not have a Stripe billing portal yet.',
      );
    }
    const appUrl = this.configService.get<string>(
      'APP_URL',
      'http://localhost:3001',
    );
    const session = await this.stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${appUrl}/settings`,
    });

    return {
      url: session.url,
    };
  }
  async getInvoices(userId: string) {
    const invoices = await this.db
      .select()
      .from(schema.payment_invoices)
      .where(eq(schema.payment_invoices.user_id, userId))
      .orderBy(desc(schema.payment_invoices.created_at));
    return { invoices };
  }
  async handleStripeWebhook(signature: string | undefined, rawBody: Buffer) {
    const webhookSecret = this.configService.get<string>(
      'STRIPE_WEBHOOK_SECRET',
    );
    if (!webhookSecret)
      throw new InternalServerErrorException(
        'STRIPE_WEBHOOK_SECRET is not set',
      );
    if (!signature) {
      throw new BadRequestException('Missing Stripe webhook signature');
    }
    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(
        rawBody,
        signature,
        webhookSecret,
      );
    } catch (error) {
      throw new BadRequestException('Invalid Stripe webhook signature');
    }
    switch (event.type) {
      case 'checkout.session.completed':
        await this.activatePlanFromCheckoutSession(
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.activatePlanFromSubscription(
          event.data.object as Stripe.Subscription,
        );
        break;
      case 'invoice.created':
      case 'invoice.finalized':
      case 'invoice.payment_failed':
      case 'invoice.voided':
        await this.saveInvoice(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice;
        await this.saveInvoice(invoice);
        await this.activatePlanFromInvoice(invoice);
        break;
      }
      default:
        break;
    }
    return { recieved: true };
  }

  private async activatePlanFromSubscription(
    subscription: Stripe.Subscription,
  ) {
    const subscriptionData = subscription as any;
    const userId = subscription.metadata?.userId;
    const stripePriceId = subscriptionData.items?.data?.[0]?.price?.id;
    const plan = this.resolvePaidPlan(
      subscription.metadata?.plan,
      stripePriceId,
    );
    if (!userId || plan === PlanTier.FREE) {
      return;
    }

    const stripeCustomerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;

    await this.activatePaidPlan({
      userId,
      plan,
      stripeCustomerId,
      stripeSubscriptionId: subscription.id,
      stripePriceId,
    });
  }

  private async activatePlanFromInvoice(invoice: Stripe.Invoice) {
    const invoiceData = invoice as any;
    const stripeCustomerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;
    const stripeSubscriptionId =
      typeof invoiceData.subscription === 'string'
        ? invoiceData.subscription
        : invoiceData.subscription?.id ||
          invoiceData.parent?.subscription_details?.subscription;

    const stripePriceId = invoiceData.lines?.data?.[0]?.price?.id;
    const plan = this.resolvePaidPlan(
      invoice.metadata?.plan ||
        invoiceData.subscription_details?.metadata?.plan ||
        invoiceData.parent?.subscription_details?.metadata?.plan,
      stripePriceId,
    );
    const userId = await this.getUserIdForInvoice(
      invoice,
      stripeCustomerId,
      stripeSubscriptionId,
    );

    if (!userId || plan === PlanTier.FREE) {
      return;
    }
    await this.activatePaidPlan({
      userId,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
    });
  }

  private getPlanFromPriceId(stripePriceId?: string) {
    if (!stripePriceId) {
      return PlanTier.FREE;
    }

    const priceIdToPlan: Record<string, PlanTier> = {
      [this.getStripePriceId('starter')]: PlanTier.STARTER,
      [this.getStripePriceId('pro')]: PlanTier.PRO,
      [this.getStripePriceId('business')]: PlanTier.BUSINESS,
    };
    return priceIdToPlan[stripePriceId] ?? PlanTier.FREE;
  }
  private resolvePaidPlan(rawPlan?: string | null, stripePriceId?: string) {
    const plan = normalizePlanTier(rawPlan);

    if (plan !== PlanTier.FREE) {
      return plan;
    }
    return this.getPlanFromPriceId(stripePriceId);
  }

  private async activatePlanFromCheckoutSession(
    session: Stripe.Checkout.Session,
  ) {
    const sessionData = session as any;
    const userId = session.client_reference_id || session.metadata?.userId;
    const stripePriceId = sessionData.line_items?.data?.[0]?.price?.id;
    const plan = this.resolvePaidPlan(session.metadata?.plan, stripePriceId);

    if (!userId || plan === PlanTier.FREE) {
      return;
    }
    const stripeCustomerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id;
    const stripeSubscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    await this.activatePaidPlan({
      userId,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
    });
  }
  private async activatePaidPlan({
    userId,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
  }: {
    userId: string;
    plan: PlanTier;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
  }) {
    const now = new Date();
    const planDefaults = PLAN_DEFAULTS[plan] ?? PLAN_DEFAULTS[PlanTier.FREE];

    await this.updatePlanSources({
      userId,
      plan,
      stripeCustomerId,
      stripeSubscriptionId,
      stripePriceId,
      updatedAt: now,
    });
  }
  private async updatePlanSources({
    userId,
    plan,
    stripeCustomerId,
    stripeSubscriptionId,
    stripePriceId,
    updatedAt,
  }: {
    userId: string;
    plan: PlanTier;
    stripeCustomerId?: string;
    stripeSubscriptionId?: string;
    stripePriceId?: string;
    updatedAt: Date;
  }) {
    const lrukey = `plan:${userId}`;
    const redisKey = planRedisKey(userId);

    planCache.set(lrukey, { name: plan });
    await this.redis.hset(redisKey, {
      name: plan,
    });
    await this.redis.expire(redisKey, PLAN_REDIS_TTL_SEC);
    await this.db
      .insert(schema.plan)
      .values({
        user_id: userId,
        name: plan,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_price_id: stripePriceId,
        created_at: updatedAt,
        updated_at: updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.plan.user_id,
        set: {
          name: plan,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          stripe_price_id: stripePriceId,
          updated_at: updatedAt,
        },
      });
  }
  private async updateUsageSources({
    userId,
    eventsLimit,
    updatedAt,
  }: {
    userId: string;
    eventsLimit: number;
    updatedAt: Date;
  }) {
    const lruKey = `usage:${userId}`;
    const redisKey = usageRediskey(userId);
    const currentUsage = usageCache.get(lruKey);
    const record = currentUsage
      ? undefined
      : await this.db.query.usage.findFirst({
          where: (usage) => eq(usage.user_id, userId),
          columns: {
            events_used: true,
          },
        });
    const eventsUsed = currentUsage?.events_used ?? record?.events_used ?? 0;
    usageCache.set(lruKey, {
      events_used: eventsUsed,
      events_limit: eventsLimit,
    });
    await this.redis.hset(redisKey, {
      events_used: eventsUsed.toString(),
      events_limit: eventsLimit.toString(),
    });
    await this.redis.expire(redisKey, PLAN_REDIS_TTL_SEC);

    await this.db
      .insert(schema.usage)
      .values({
        user_id: userId,
        events_used: eventsUsed,
        events_limit: eventsLimit,
        created_at: updatedAt,
        updated_at: updatedAt,
      })
      .onConflictDoUpdate({
        target: schema.usage.user_id,
        set: {
          events_limit: eventsLimit,
          updated_at: updatedAt,
        },
      });
  }
  private async getUserIdForInvoice(
    invoice: Stripe.Invoice,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string,
  ) {
    const invoiceData = invoice as any;
    const metadataUserId =
      invoice.metadata?.userId ||
      invoiceData.subscription_details?.metadata?.userId ||
      invoiceData.parent?.subscription_details?.metadata?.userId;

    if (metadataUserId) {
      return metadataUserId;
    }
    if (stripeSubscriptionId) {
      const [plan] = await this.db
        .select({ user_id: schema.plan.user_id })
        .from(schema.plan)
        .where(eq(schema.plan.stripe_subscription_id, stripeSubscriptionId))
        .limit(1);
      if (plan?.user_id) return plan?.user_id;
    }
    if (stripeCustomerId) {
      const [plan] = await this.db
        .select({ user_id: schema.plan.user_id })
        .from(schema.plan)
        .where(eq(schema.plan.stripe_customer_id, stripeCustomerId))
        .limit(1);
      if (plan?.user_id) return plan.user_id;
    }
  }
  private fromUnix(value?: number | null) {
    return value ? new Date(value * 1000) : null;
  }
  private async saveInvoice(invoice: Stripe.Invoice) {
    const stripeInvoiceId = invoice.id;
    if (!stripeInvoiceId) {
      return;
    }
    const invoiceData = invoice as any;

    const stripeCustomerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    const stripeSubscriptionId =
      typeof invoiceData.subscription === 'string'
        ? invoiceData.subscription
        : invoiceData.subscription?.id ||
          invoiceData.parent?.subscription_details?.subscription;

    const userId = await this.getUserIdForInvoice(
      invoice,
      stripeCustomerId,
      stripeSubscriptionId,
    );

    if (!userId) {
      return;
    }

    await this.db
      .insert(schema.payment_invoices)
      .values({
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        stripe_invoice_id: stripeInvoiceId,
        status: invoiceData.status ?? null,
        currency: invoiceData.currency ?? null,
        amount_due: invoiceData.amount_due ?? null,
        amount_paid: invoiceData.amount_paid ?? null,
        hosted_invoice_url: invoiceData.hosted_invoice_url ?? null,
        invoice_pdf: invoiceData.invoice_pdf ?? null,
        period_start: this.fromUnix(invoiceData.period_start),
        period_end: this.fromUnix(invoiceData.period_end),
        created_at: this.fromUnix(invoiceData.created),
      })
      .onConflictDoUpdate({
        target: schema.payment_invoices.stripe_invoice_id,
        set: {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          status: invoiceData.status ?? null,
          currency: invoiceData.currency ?? null,
          amount_due: invoiceData.amount_due ?? null,
          amount_paid: invoiceData.amount_paid ?? null,
          hosted_invoice_url: invoiceData.hosted_invoice_url ?? null,
          invoice_pdf: invoiceData.invoice_pdf ?? null,
          period_start: this.fromUnix(invoiceData.period_start),
          period_end: this.fromUnix(invoiceData.period_end),
          created_at: this.fromUnix(invoiceData.created),
        },
      });
  }
}
