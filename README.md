# ULogs

> A developer-focused observability platform for collecting, exploring, and integrating application logs.

[![Status: In Progress](https://img.shields.io/badge/status-in--progress-orange)](#project-status)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io/)

ULogs is currently under active development. This repository contains the landing page, authenticated dashboard, and backend service that power the platform. APIs and infrastructure may change while the product moves toward its first production release.

## Contents

- [Project status](#project-status)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Getting started](#getting-started)
- [Available commands](#available-commands)
- [SDK](#sdk)
- [Backend API](#backend-api)
- [Billing and invoices](#billing-and-invoices)
- [Testing](#testing)
- [Production considerations](#production-considerations)
- [Security](#security)
- [Contributing](#contributing)
- [License](#license)

## Project status

### Implemented

- Public marketing and landing-page experience.
- Authenticated dashboard shell with Clerk integration.
- API-key creation, listing, inspection, revocation, and regeneration endpoints.
- Clerk bearer-token and API-key authentication paths.
- PostgreSQL persistence through Neon and Drizzle ORM.
- Redis-backed API-key caching and last-used tracking.
- Local ClickHouse, ClickHouse UI, and NATS infrastructure through Docker Compose.
- NestJS log ingestion routes for batched send, list queries, and SSE streaming.
- Initial `@ulogs/next` SDK package with typed log payloads, buffered delivery, and API-key authentication headers.
- TestSprite coverage for the API-key service, including authenticated flows where test credentials are available and unauthenticated contract checks.
- Verified TypeScript builds for both the backend service and the SDK package.

### In progress

- Final production hardening, retention policy, and ClickHouse query optimization for log analytics.
- Production deployment and operational observability.
- Automated CI quality gates and release workflows.
- Final SDK publishing workflow and broader integration coverage.

## Architecture

```mermaid
flowchart LR
    Visitor[Visitor] --> Landing[Landing page\nNext.js]
    User[Authenticated user] --> Dashboard[Main dashboard\nNext.js + Clerk]
    Dashboard --> API[NestJS API\n/api/v1]
    API --> Clerk[Clerk\nToken verification]
    API --> Postgres[(Neon PostgreSQL\nDrizzle ORM)]
    API --> Redis[(Redis 7\nCache and locks)]
    API -. in progress .-> ClickHouse[(ClickHouse\nLog analytics)]
    API -. planned .-> NATS[NATS JetStream\nLog transport]
```

The repository contains three independently runnable applications plus an SDK package:

- **Landing page:** public product and integration experience.
- **Main dashboard:** authenticated product interface.
- **Services:** NestJS API and persistence/authentication boundary.
- **SDK:** `@ulogs/next`, a typed Node/Next.js logging client under active development.

## Repository layout

```text
.
├── apps/
│   ├── landing-page/       # Public Next.js marketing site
│   └── main-dashboard/     # Authenticated Next.js dashboard
├── services/                # NestJS API, database, Redis integration, tests
│   ├── src/
│   ├── test/
│   ├── drizzle/             # Generated database migrations
│   └── docker-compose.yml   # Local Redis, ClickHouse, UI, and NATS services
├── sdks/
│   └── ulogs-next/           # Typed SDK package; private src, distributable dist
├── testsprite_tests/        # Generated API test plans, cases, and reports
└── .vscode/                 # Local editor/MCP configuration
```

Each application has its own `package.json`, lockfile, TypeScript configuration, and dependency installation. There is no root-level package manager workspace yet.

## Prerequisites

- Node.js 20 or newer (Node.js 24 is used in the current development environment).
- npm 10 or newer.
- Docker Desktop, for local Redis, ClickHouse, ClickHouse UI, and NATS.
- A Neon PostgreSQL database and connection string.
- A Clerk application with a secret key for authenticated API requests.
- A TestSprite account and API key only when running TestSprite MCP tests.

## Configuration

Do not commit secrets. The existing `.env` files are intentionally ignored by Git. Create the following files locally.

### Backend: `services/.env`

```dotenv
PORT=8080
DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=ulogs
REDIS_DB=0
REDIS_KEY_SECRET=<random-secret>
CLERK_SECRET_KEY=<clerk-secret-key>
STRIPE_SECRET_KEY=<stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<stripe-webhook-signing-secret>
STRIPE_STARTER_PRICE_ID=<stripe-starter-price-id>
STRIPE_PRO_PRICE_ID=<stripe-pro-price-id>
STRIPE_BUSINESS_PRICE_ID=<stripe-business-price-id>
APP_URL=http://localhost:3000
```

`REDIS_KEY_SECRET` is used to derive API-key cache digests and should be a long, random value. Use a secret manager for shared or production environments.

The Stripe price IDs must refer to recurring subscription prices in the same Stripe account as `STRIPE_SECRET_KEY`. `APP_URL` is used for Stripe Checkout and Billing Portal return URLs.

### Main dashboard: `apps/main-dashboard/.env`

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-publishable-key>
NEXT_PUBLIC_SERVER_URI=http://localhost:8080/api/v1
```

The dashboard obtains a Clerk session token in the browser and sends it to the backend as a bearer token.

### SDK: `sdks/ulogs-next`

The SDK uses the local API by default. Override the endpoint for staging or production with:

```dotenv
ULOGS_BASE_URL=https://api.example.com/api/v1
```

The current transport reads `ULOGS_BASE_URL` at runtime and falls back to `http://localhost:8080/api/v1`.

### Landing page

Review the landing-page authentication and configuration code before deployment. Do not copy production credentials into source control or frontend bundles unless the variable is explicitly intended to be public.

## Getting started

### 1. Install dependencies

Open separate terminals, or run each command from its package directory:

```powershell
cd services
npm install

cd ..\apps\main-dashboard
npm install

cd ..\landing-page
npm install

cd ..\..\sdks\ulogs-next
npm install
```

### 2. Configure the backend

Create `services/.env` using the template above and provide a valid Neon `DATABASE_URL` and Clerk secret. Ensure the database schema is available before starting authenticated API flows.

### 3. Start local infrastructure

From the `services` directory:

```powershell
docker compose up -d
```

This starts:

- Redis on `localhost:6379`
- ClickHouse HTTP on `localhost:8123` and native protocol on `localhost:9000`
- ClickHouse UI on `localhost:5521`
- NATS client connections on `localhost:4222` and monitoring on `localhost:8222`

Use `docker compose ps` to inspect container status and `docker compose down` to stop the stack.

### 4. Start the backend

```powershell
cd services
npm run start:dev
```

The API listens on `http://localhost:8080` and uses the versioned base path `http://localhost:8080/api/v1`.

### 5. Start the dashboard

```powershell
cd apps\main-dashboard
npm run dev
```

Open `http://localhost:3000`.

### 6. Start the landing page

Use a separate terminal:

```powershell
cd apps\landing-page
npm run dev
```

If port `3000` is already in use by the dashboard, start the landing page on another Next.js development port.

## Available commands

### Backend (`services`)

| Command               | Purpose                                    |
| --------------------- | ------------------------------------------ |
| `npm run start:dev`   | Start NestJS in watch mode                 |
| `npm run build`       | Compile the service                        |
| `npm run test`        | Run unit tests                             |
| `npm run test:e2e`    | Run end-to-end tests                       |
| `npm run test:cov`    | Generate test coverage                     |
| `npm run db:generate` | Generate Drizzle migrations                |
| `npm run db:migrate`  | Apply Drizzle migrations                   |
| `npm run db:push`     | Push the schema to the configured database |

> **Current production-start note:** the current Nest build emits `dist/src/main.js`, while `npm run start:prod` currently targets `dist/main`. Until that script is aligned, use `npm run build` followed by `node dist/src/main.js` from `services`.

### Frontends (`apps/main-dashboard` and `apps/landing-page`)

| Command         | Purpose                              |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the Next.js development server |
| `npm run build` | Create a production build            |
| `npm run start` | Serve a completed production build   |
| `npm run lint`  | Run ESLint                           |

### SDK (`sdks/ulogs-next`)

| Command              | Purpose                                                  |
| -------------------- | -------------------------------------------------------- |
| `npm install`        | Install SDK development dependencies                     |
| `npm run build`      | Compile JavaScript and declaration files                 |
| `npm run clean`      | Remove `dist/` using the cross-platform `rimraf` tool    |
| `npm pack --dry-run` | Preview the publishable package contents                 |
| `npm publish`        | Rebuild through `prepublishOnly` and publish the package |

The SDK keeps its TypeScript implementation under `src/` locally. The repository configuration is intentionally set up to ignore `src/` and publish/track compiled `dist/` artifacts instead.

## SDK

The current package is `@ulogs/next`. It exposes `createLogger`, `ULOGSTransport`, and the public log types.

```typescript
import { createLogger } from "@ulogs/next";

const logger = createLogger({
  apiKey: process.env.ONE_MINUTE_LOGS_API_KEY!,
  appName: "orders-service",
  environment: "production",
});

await logger.info({
  message: "Order created",
  service: "checkout",
  importance: "low",
});
```

The transport buffers logs and sends batches to `POST /logs/send` below the configured API base URL. The backend route exists in the NestJS service, and the SDK package builds successfully. Publish the SDK only from the private source workspace because the GitHub-facing package layout intentionally excludes `src/`.

## Backend API

The backend uses a global `/api` prefix and URI versioning. The current API base URL is:

```text
http://localhost:8080/api/v1
```

All API-key routes require authentication through either a valid Clerk bearer token or a valid `x-api-key` header.

| Method   | Endpoint                          | Description                                              |
| -------- | --------------------------------- | -------------------------------------------------------- |
| `GET`    | `/api/v1/api-keys`                | List API keys belonging to the authenticated user        |
| `POST`   | `/api/v1/api-keys`                | Create an API key; the plaintext secret is returned once |
| `GET`    | `/api/v1/api-keys/:id`            | Retrieve last-used metadata for a key                    |
| `DELETE` | `/api/v1/api-keys/:id`            | Revoke an owned key                                      |
| `POST`   | `/api/v1/api-keys/:id/regenerate` | Generate a replacement secret for an owned key           |
| `POST`   | `/api/v1/logs/send`               | Receive a batched payload of logs from the SDK           |
| `GET`    | `/api/v1/logs`                    | Query historical logs for the authenticated user         |
| `GET`    | `/api/v1/logs/stream`             | Open an SSE stream for live log delivery                 |

API keys are stored as Argon2 hashes. The plaintext secret is not returned by listing endpoints and should be copied securely immediately after creation.

## Billing and invoices

The dashboard uses Stripe Checkout for paid plans and the Stripe Billing Portal for subscription management. Billing endpoints require a valid Clerk bearer token unless noted otherwise:

| Method | Endpoint                   | Description                                                                                                      |
| ------ | -------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/v1/billing/current`  | Return the authenticated user's current plan                                                                     |
| `GET`  | `/api/v1/billing/invoices` | List invoices saved for the authenticated user                                                                   |
| `POST` | `/api/v1/billing`          | Create a Stripe Checkout session; send `{ "plan": "starter" }`, `{ "plan": "pro" }`, or `{ "plan": "business" }` |
| `POST` | `/api/v1/billing/portal`   | Create a Stripe Billing Portal session for a paid user                                                           |
| `POST` | `/api/v1/billing/webhook`  | Receive and verify Stripe webhook events                                                                         |

Invoice records are persisted in the `payment_invoices` table when Stripe sends invoice events. The service resolves the invoice owner from Stripe metadata, the stored subscription ID, or the stored Stripe customer ID, then upserts the invoice by its Stripe invoice ID. This makes webhook retries safe and allows the dashboard's invoice table to display payment status, amounts, dates, and downloadable Stripe URLs.

### Webhook request flow

The current implementation handles a Stripe webhook as follows:

1. `services/src/main.ts` creates the Nest application with `rawBody: true`, so the original request bytes remain available for Stripe signature verification. It also registers JSON and URL-encoded body parsers with a 3 MB limit.
2. `BillingController` exposes `POST /api/v1/billing/webhook`, reads the `stripe-signature` header, and passes both the signature and `req.rawBody` to `BillingService`.
3. `BillingService` reads `STRIPE_WEBHOOK_SECRET` and calls Stripe's `constructEvent`. Missing or invalid signatures are rejected before event processing.
4. The service dispatches supported event types:

- `checkout.session.completed` activates the selected paid plan.
- `customer.subscription.created` and `customer.subscription.updated` synchronize the paid plan.
- `invoice.created`, `invoice.finalized`, `invoice.payment_failed`, and `invoice.voided` save invoice state.
- `invoice.paid` and `invoice.payment_succeeded` save invoice state and synchronize the paid plan from invoice metadata or its price ID.

5. `saveInvoice()` extracts Stripe customer/subscription IDs, resolves the application user, converts Unix timestamps to dates, and upserts the record in `payment_invoices` using `stripe_invoice_id` as the conflict key.
6. The webhook responds with `{ "recieved": true }` after the selected handler completes. (The response key is currently spelled `recieved` in the implementation.)

Invoice ownership is intentionally scoped to the authenticated application user. If an invoice has no matching `userId` metadata and no matching `plan` row for its subscription or customer, `saveInvoice()` skips it and the webhook still returns successfully. Check the Stripe event payload, the `plan` table, and the service's `DATABASE_URL` when an invoice appears in Stripe but not in the dashboard database. The API does not import historical invoices directly from Stripe; resend the event after the webhook and ownership configuration is correct.

The webhook endpoint is not protected by the Clerk `AuthGuard`; Stripe authenticates it with the `stripe-signature` header and `STRIPE_WEBHOOK_SECRET`. Do not call it with a normal browser request or alter the request body before signature verification.

### Local Stripe webhook testing

1. Start the backend and ensure `services/.env` contains the Stripe variables above.
2. Start the Stripe CLI listener from the `services` directory:

```powershell
stripe listen --forward-to localhost:8080/api/v1/billing/webhook
```

3. Copy the `whsec_...` value printed by the CLI into `STRIPE_WEBHOOK_SECRET` and restart the backend.
4. Complete a test Checkout payment or resend an existing invoice event from the Stripe Dashboard.
5. Refresh the dashboard Settings page. The invoice appears after the webhook has been accepted and persisted.

If an invoice was created before invoice persistence was enabled, resend its Stripe webhook event from **Stripe Dashboard → Developers → Webhooks**. Existing Stripe invoices are not imported automatically by the `/billing/invoices` endpoint.

## Testing

Run backend tests from `services`:

```powershell
npm run test
npm run test:e2e
```

Run frontend static checks from the relevant app:

```powershell
cd apps\main-dashboard
npm run lint
npm run build
```

TestSprite backend artifacts are stored under `testsprite_tests/`. The latest API-key report is available at [`testsprite_tests/testsprite-mcp-test-report.md`](testsprite_tests/testsprite-mcp-test-report.md).

For TestSprite MCP, keep the API key outside source control. The workspace MCP configuration uses a masked VS Code input rather than embedding the credential in `.vscode/mcp.json`.

## Production considerations

Before calling this project production-ready:

- Move all secrets to a managed secret store such as Azure Key Vault, AWS Secrets Manager, or an equivalent platform service.
- Replace local Redis credentials and configure TLS, network restrictions, persistence, monitoring, and backups as appropriate.
- Add a public health/readiness endpoint for load balancers and tunnel-based testing.
- Align the production start script with the actual Nest build output.
- Complete ClickHouse ingestion, retention, indexing, and query paths for log data.
- Add structured logging, tracing, metrics, alerting, and error tracking.
- Secure ClickHouse and NATS credentials/configuration; the local Compose file currently uses development defaults.
- Add rate limiting and abuse protection to authentication and API-key endpoints.
- Complete the SDK retry/error semantics and provide a documented ingestion contract before publishing it for production use.
- Add CI checks for formatting, linting, type checking, migrations, unit tests, e2e tests, and dependency vulnerabilities.
- Review CORS, Clerk token validation, ownership checks, and cache invalidation before deployment.
- Use separate credentials and databases for development, staging, and production.

## Security

- Never commit `.env` files, API keys, database URLs, Clerk secrets, or MCP credentials.
- Rotate any credential that has been exposed in logs, chat, screenshots, commits, or configuration files.
- Treat API-key plaintext values as one-time secrets.
- Keep server-only credentials out of `NEXT_PUBLIC_*` variables and browser bundles.
- Do not expose `x-api-key` values in client-side applications; the SDK is intended for server-side usage.
- Prefer short-lived credentials and least-privilege database roles.
- Report security issues privately to the project maintainers rather than opening a public issue with exploit details.

## Contributing

1. Create a focused branch from the current development branch.
2. Keep changes scoped and update documentation for user-facing behavior.
3. Add or update tests for backend behavior and API contracts.
4. Run the relevant lint, type-check, build, and test commands locally.
5. Open a pull request with a concise summary, validation evidence, configuration changes, and known limitations.

## License

The repository does not currently declare a finalized open-source license. Treat the project as proprietary unless the maintainers publish explicit licensing terms.

## Related documentation

- [`services/README.md`](services/README.md) — NestJS service notes
- [`apps/main-dashboard/README.md`](apps/main-dashboard/README.md) — dashboard notes
- [`apps/landing-page/README.md`](apps/landing-page/README.md) — landing-page notes
