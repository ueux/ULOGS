import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

export const api_key = pgTable('api_key', {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: text('user_id').notNull(),
    prefix: text('prefix').notNull(),
    value: text('value').notNull(),
    created_at: timestamp('created_at', { withTimezone: true } ).defaultNow(),
    last_used_at: timestamp( 'last_used_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
})