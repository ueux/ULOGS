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
- [Backend API](#backend-api)
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
- TestSprite coverage for the API-key service, including authenticated flows where test credentials are available and unauthenticated contract checks.

### In progress

- Log ingestion and ClickHouse persistence. The ClickHouse client module is currently a placeholder.
- Production deployment and operational observability.
- Automated CI quality gates and release workflows.
- Final API contracts, SDK packaging, and broader integration coverage.

## Architecture

```mermaid
flowchart LR
    Visitor[Visitor] --> Landing[Landing page\nNext.js]
    User[Authenticated user] --> Dashboard[Main dashboard\nNext.js + Clerk]
    Dashboard --> API[NestJS API\n/api/v1]
    API --> Clerk[Clerk\nToken verification]
    API --> Postgres[(Neon PostgreSQL\nDrizzle ORM)]
    API --> Redis[(Redis 7\nCache and locks)]
    API -. planned .-> ClickHouse[(ClickHouse\nLog analytics)]
```

The system is organized as three independently runnable applications:

- **Landing page:** public product and integration experience.
- **Main dashboard:** authenticated product interface.
- **Services:** NestJS API and persistence/authentication boundary.

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
│   └── docker-compose.yml   # Local Redis service
├── testsprite_tests/        # Generated API test plans, cases, and reports
└── .vscode/                 # Local editor/MCP configuration
```

Each application has its own `package.json`, lockfile, TypeScript configuration, and dependency installation. There is no root-level package manager workspace yet.

## Prerequisites

- Node.js 20 or newer (Node.js 24 is used in the current development environment).
- npm 10 or newer.
- Docker Desktop, for local Redis.
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
```

`REDIS_KEY_SECRET` is used to derive API-key cache digests and should be a long, random value. Use a secret manager for shared or production environments.

### Main dashboard: `apps/main-dashboard/.env`

```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<clerk-publishable-key>
NEXT_PUBLIC_SERVER_URI=http://localhost:8080/api/v1
```

The dashboard obtains a Clerk session token in the browser and sends it to the backend as a bearer token.

### Landing page

Review the landing-page authentication and configuration code before deployment. Do not copy production credentials into source control or frontend bundles unless the variable is explicitly intended to be public.

## Getting started

### 1. Install dependencies

Open three terminals, or run each command from its package directory:

```powershell
cd services
npm install

cd ..\apps\main-dashboard
npm install

cd ..\landing-page
npm install
```

### 2. Configure the backend

Create `services/.env` using the template above and provide a valid Neon `DATABASE_URL` and Clerk secret. Ensure the database schema is available before starting authenticated API flows.

### 3. Start Redis

From the `services` directory:

```powershell
docker compose up -d redis
```

Confirm the container is healthy before exercising cache-dependent endpoints.

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

API keys are stored as Argon2 hashes. The plaintext secret is not returned by listing endpoints and should be copied securely immediately after creation.

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
- Add rate limiting and abuse protection to authentication and API-key endpoints.
- Add CI checks for formatting, linting, type checking, migrations, unit tests, e2e tests, and dependency vulnerabilities.
- Review CORS, Clerk token validation, ownership checks, and cache invalidation before deployment.
- Use separate credentials and databases for development, staging, and production.

## Security

- Never commit `.env` files, API keys, database URLs, Clerk secrets, or MCP credentials.
- Rotate any credential that has been exposed in logs, chat, screenshots, commits, or configuration files.
- Treat API-key plaintext values as one-time secrets.
- Keep server-only credentials out of `NEXT_PUBLIC_*` variables and browser bundles.
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
