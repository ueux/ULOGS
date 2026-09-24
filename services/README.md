# ULogs Services

NestJS backend for the ULogs observability platform: authentication, log ingestion, alerting, usage quotas, billing (Stripe), and persistence.

The API is served under a global `api` prefix with URI versioning, so every route lives at:

```text
http://localhost:8080/api/v1
```

## Module map

```text
src/
├── modules/
│   ├── api-key/     # Create/list/inspect/revoke/regenerate API keys (Argon2-hashed)
│   ├── logs/        # POST /logs/send (NATS publish), GET /logs (ClickHouse), SSE stream,
│   │                # dashboard aggregates, live metrics stream
│   ├── alert/       # Alert rule CRUD + inbound webhook signature verification
│   └── billing/     # Stripe Checkout, Billing Portal, invoices, webhook handling, plan sync
├── nats/            # JetStream setup, ingest consumer (ClickHouse insert), alert consumer
│                    # (condition matching, Redis buckets, HMAC-signed outbound webhooks)
├── clickhouse/      # ClickHouse client + log table bootstrap
├── database/        # Drizzle ORM client (Neon Postgres) and schema
├── guards/          # AuthGuard (Clerk bearer OR x-api-key), UsageGuard (plan quotas)
├── schedulers/      # @nestjs/cron sync of Redis usage counters back to Postgres
├── sse/             # SSE client registry used to broadcast live logs/metrics
├── infra/           # Redis and other infrastructure helpers
└── utils/           # Key digests, shared helpers
```

## How ingestion works

1. SDKs POST batches to `/api/v1/logs/send`; the request is authenticated by `AuthGuard` and checked against the plan quota by `UsageGuard`.
2. Events are published to a NATS JetStream subject and acknowledged immediately.
3. The ingest consumer (`src/nats/consumer.ts`) batches messages into ClickHouse, updates Redis usage counters and live metrics (`ingest:events`, `ingest:last_rate`, `ingest:avg_latency`), and publishes an evaluation event per log.
4. The alert consumer (`src/nats/alert.consumer.ts`) matches each log against the user's alert rules (Redis-cached with a TTL and a DB fallback), counts matches in windowed buckets, respects per-rule cooldowns, and delivers HMAC-signed webhooks to validated public URLs (SSRF guard blocks loopback/private ranges).
5. Dashboard live views consume `GET /logs/stream` and `GET /logs/metrics/stream` through the SSE registry.

## Prerequisites

- Node.js 20+ and npm 10+.
- Docker Desktop for the local Redis / ClickHouse / ClickHouse UI / NATS stack.
- A Neon PostgreSQL URL, a Clerk secret key, and (for billing) Stripe secret + webhook credentials.

## Configuration (`services/.env`)

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (dev convention: `8080`; falls back to `3000` if unset) |
| `DATABASE_URL` | Neon Postgres connection string used by Drizzle |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `REDIS_DB` | Redis connection |
| `REDIS_KEY_SECRET` | Pepper used to derive API-key cache digests — long random value |
| `CLERK_SECRET_KEY` | Clerk token verification in `AuthGuard` |
| `CLICKHOUSE_URL` / `CLICKHOUSE_USER` / `CLICKHOUSE_PASSWORD` / `CLICKHOUSE_DB` | ClickHouse connection (defaults to `http://localhost:8123`, db `logs`) |
| `NATS_URL` | NATS server (default `nats://localhost:4222`) |
| `STRIPE_SECRET_KEY` | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | Verifies `POST /billing/webhook` signatures |
| `STRIPE_STARTER_PRICE_ID` / `STRIPE_PRO_PRICE_ID` / `STRIPE_BUSINESS_PRICE_ID` | Recurring prices per plan tier |
| `WEBHOOK_SIGNING_SECRET` | HMAC secret for outbound alert webhooks |
| `APP_URL` | Stripe Checkout/Portal return URL base |

Never commit `.env`. Rotate anything that leaks.

## Local infrastructure

```bash
docker compose up -d   # redis :6379, clickhouse :8123/:9000, ch-ui :5521, nats :4222 (monitoring :8222)
docker compose ps      # inspect
docker compose down    # stop
```

## Commands

```bash
npm install

npm run start:dev      # watch mode (main entry: src/main.ts)
npm run build          # nest build → dist/src/main.js

npm run db:generate    # drizzle-kit: generate migrations from schema changes
npm run db:migrate     # apply migrations
npm run db:push        # push schema directly (development only)

npm run test           # jest unit tests
npm run test:e2e       # jest e2e tests
npm run test:cov       # coverage
```

> **Known script mismatch:** `npm run start:prod` targets `dist/main`, but the current build emits `dist/src/main.js`. Until the script is fixed, run production mode with:
>
> ```bash
> npm run build && node dist/src/main.js
> ```

## Auth model

- **User-facing routes** (dashboard): `Authorization: Bearer <Clerk session token>`.
- **Machine-facing routes** (SDKs): `x-api-key: ULOG_...`, verified against Argon2 hashes with Redis/LRU caching; last-used timestamps tracked per key.
- **Stripe webhook** (`POST /billing/webhook`): no Clerk auth; verified via `stripe-signature` + `STRIPE_WEBHOOK_SECRET` against the raw request body (`rawBody: true`).
- **Alert webhook verification** (`POST /alerts/verify-webhook`): lets SDK consumers verify inbound HMAC-signed alert deliveries with their API key.

## Testing Stripe webhooks locally

```bash
stripe listen --forward-to localhost:8080/api/v1/billing/webhook
```

Copy the printed `whsec_...` into `STRIPE_WEBHOOK_SECRET` and restart the service. See the root [README](../README.md#billing-and-invoices) for the full event-handling flow.

## Notes

- `services/schedulers/usage-db-sync.ts` (outside `src/`) is a stale pre-move copy of the cron job; the live one is `src/schedulers/usage-db-sync.ts`, registered in `app.module.ts`. The old file can be deleted.
- Quota counters live in Redis with TTLs; the scheduled sync persists them to Postgres, so counters survive cache eviction but can lag by up to one cron interval.
