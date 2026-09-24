# ULogs Main Dashboard

Authenticated Next.js (App Router) workspace for the ULogs observability platform: log overview, live tail, queries, alert rules, API keys, integrations, and billing — all on Clerk auth and the `@ulogs/next` SDK.

This app is part of the [ULogs monorepo](../../README.md); the backend it talks to lives in [`services/`](../../services/README.md).

## Getting started

```bash
npm install
npx next dev -p 3001
```

Open `http://localhost:3001`. Requirements:

- The backend running at `NEXT_PUBLIC_SERVER_URI` (default `http://localhost:8080/api/v1`) with the local Docker stack (Redis/ClickHouse/NATS) up.
- The SDK rebuilt locally — `apps/main-dashboard` consumes `@ulogs/next` as a `file:` dependency pointing at [`sdks/ulogs-next`](../../sdks/ulogs-next/README.md). After changing SDK source, run `npm run build` in that folder; the link picks up the new `dist/`.

## Environment (`.env`)

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk browser key |
| `NEXT_PUBLIC_SERVER_URI` | Backend base URL, e.g. `http://localhost:8080/api/v1` |
| `NEXT_PUBLIC_MARKETING_URL` | Where `proxy.ts` sends unauthenticated visitors (the landing page) |
| `ULOGS_API_KEY` | Server-side `ULOG_...` key used by the SDK inside route handlers |

## Routes

| Path | Description |
| --- | --- |
| `/` | Overview: 24h metrics cards, log/error trend charts, top activity & sources, recent alerts, live ingest metrics |
| `/live-logs` | Real-time tail over SSE with reconnect + polling fallback, level/search filters |
| `/queries` | Query console translating `type:error AND appName:billing`-style tokens into backend filters |
| `/alerts` | Alert rule creation (multi-step wizard with webhook verification), listing, details |
| `/api-keys` | Create/list/revoke/regenerate ULogs API keys |
| `/integrations` | SDK setup snippets for getting logs in |
| `/settings` | Profile, plan, Stripe Checkout/Billing Portal, invoice history |

## Server-side API proxies

Browser code never holds the API key or talks to the backend directly with user secrets; Next route handlers do:

| Route | Purpose |
| --- | --- |
| `app/api/ulogs/[types]/route.ts` | Proxies log read/stream calls through the SDK, forwarding the visitor's Clerk session token (`authToken`) so each user sees their own data |
| `app/api/logs/get-logs/route.ts` | Dashboard aggregate stats (used by the overview page) |
| `app/api/live-metrics/route.ts` | Re-exposes the backend ingest-metrics SSE stream (rate, backlog, latency) |

## Auth & middleware

> **This app runs a modified Next.js release: the middleware file is `proxy.ts`, not `middleware.ts`.** Framework docs live in `node_modules/next/dist/docs/`.

`proxy.ts` gates the dashboard: unauthenticated requests to `/api/*` get a JSON `401`, and unauthenticated page visits redirect to `NEXT_PUBLIC_MARKETING_URL`. If that variable is unset it falls back to `/sign-in` on this app's own origin — which has no sign-in route here, so always set `NEXT_PUBLIC_MARKETING_URL` when running the dashboard. Sign-in/sign-up are hosted on the landing app via Clerk.

## Scripts

```bash
npm run dev     # next dev
npm run build   # production build
npm run start   # serve production build
npm run lint    # eslint
```

## Data-flow notes

- All backend calls use `NEXT_PUBLIC_SERVER_URI` and the versioned `/api/v1` base; auth is `Authorization: Bearer <Clerk token>` from `getToken()`.
- Live views use the SDK's `getStream` hook; the history view uses `getLogs` (in-flight dedupe + 15s result cache; `refetch()` busts it).
- Timestamps from ClickHouse arrive either as `"YYYY-MM-DD HH:MM:SS"` strings or epoch numbers — client code normalizes both (see `toDateSafe` on the overview page).
