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
import { normalizePlanTier, PlanTier } from '../../config';
import * as schema from '../../database/schema';

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
    const record = await this.db.query.plan.findFirst({
      where: (p: any) => eq(p.user_id, userId),
      columns: {
        name: true,
        stripe_customer_id: true,
      },
    });
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
}
