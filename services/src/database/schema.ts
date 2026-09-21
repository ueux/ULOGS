import {
  bigint,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const api_key = pgTable('api_key', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  prefix: text('prefix').notNull(),
  value: text('value').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});
export const usage = pgTable('usage', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull().unique(),
  events_used: bigint('events_used', { mode: 'number' }),
  events_limit: bigint('events_limit', { mode: 'number' }),
  created_at: timestamp('created_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }),
});

export const plan = pgTable('plan', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull().unique(),
  name: text('name').notNull(),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  stripe_price_id: text('stripe_price_id'),
  created_at: timestamp('created_at', { withTimezone: true }),
  updated_at: timestamp('updated_at', { withTimezone: true }),
});

export const payment_invoices = pgTable('payment_invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  stripe_customer_id: text('stripe_customer_id'),
  stripe_subscription_id: text('stripe_subscription_id'),
  stripe_invoice_id: text('stripe_invoice_id').notNull().unique(),
  status: text('status'),
  currency: text('currency'),
  amount_due: bigint('amount_due', { mode: 'number' }),
  amount_paid: bigint('amount_paid', { mode: 'number' }),
  hosted_invoice_url: text('hosted_invoice_url'),
  invoice_pdf: text('invoice_pdf'),
  period_start: timestamp('period_start', { withTimezone: true }),
  period_end: timestamp('period_end', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const alerts = pgTable('alerts', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: text('user_id').notNull(),
  name: text('name').notNull(),
  conditions: jsonb('conditions')
    .$type<
      {
        field: string;
        operator: string;
        value: string;
      }[]
    >()
    .notNull(),
  threshold_count: integer('threshold_count').notNull(),
  threshold_window_minutes: integer('threshold_window_minutes').notNull(),
  webhook_url: text('webhook_url').notNull(),
  cooldown_period: text('cooldown_period').notNull(),
  summary: text('summary').notNull(),
  status: text('status').default('active'),
  appName: text('appName').notNull(),
  last_triggered: timestamp('last_triggered', {
    withTimezone: true,
  }),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
