import { bigint, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
