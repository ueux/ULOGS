# @ulogs/next

A lightweight typed logging SDK for Node.js and Next.js apps on [ULogs](https://ulogs.com). Set up your logging pipeline within one minute.

- Structured, typed log payloads (`info`, `error`, `warning`, `audit`, `metric`, `debug`, `success`)
- Buffered batch delivery with a 2-second flush interval and graceful-shutdown flush
- Live log reads: history queries and an SSE stream wrapper
- React data hooks (`getLogs`, `getStream`) for dashboard-style UIs
- Inbound alert-webhook signature verification

```bash
npm install @ulogs/next
```

## Quick start

```typescript
import { createLogger } from "@ulogs/next";

const logger = createLogger({
  apiKey: process.env.ONE_MINUTE_LOGS_API_KEY!,   // ULOG_... key from the dashboard
  appName: "orders-service",                       // optional: stamped on every log
  environment: process.env.NODE_ENV,               // optional: defaults to NODE_ENV or "development"
});

await logger.info({
  message: "Order created",
  importance: "low",
  service: "checkout",
  subsystem: "db",
  operation: "create-order",
});

await logger.error({
  message: "Payment provider timeout",
  importance: "critical",
});
```

## Configuration

| Option        | Type     | Description                                                    |
| ------------- | -------- | -------------------------------------------------------------- |
| `apiKey`      | `string` | **Required.** Your `ULOG_...` API key.                          |
| `appName`     | `string` | Default app name attached to every log and header.             |
| `environment` | `string` | Default environment (`production`, `staging`, …).              |
| `baseUrl`     | `string` | Unused override slot; the endpoint is read from `ULOGS_BASE_URL`. |

The API endpoint is resolved at runtime:

```dotenv
ULOGS_BASE_URL=https://api.example.com/api/v1   # defaults to http://localhost:8080/api/v1
```

> The `x-api-key` header is a server-side secret. Never call `createLogger` from browser/client code.

## Log payloads

Every method accepts a payload object:

```typescript
type LogType = "error" | "warning" | "info" | "audit" | "metric" | "debug" | "success";
type Importance = "critical" | "high" | "medium" | "low";
type Subsystem = "db" | "cache" | "queue" | "network";
type UserRole = "super-admin" | "admin" | "user";
type AuthStatus = "success" | "failed" | "expired";

interface LogPayload {
  message: string;
  importance?: Importance;
  subsystem?: Subsystem;
  operation?: string;
  service?: string;
  track?: { user_id?: string; role?: UserRole; ip?: string; user_agent?: string; geo?: string };
  security?: { auth_status?: AuthStatus; suspicious?: boolean; tags?: string[] };
  metrics?: { latency_ms: number; db_query_count: number };
  timestamps?: { event_time: string; ingest_time?: string };
  appName?: string;      // overrides the logger default
  environment?: string;  // overrides the logger default
}
```

### Logger methods

| Method | Description |
| --- | --- |
| `logger.send(payload)` | Send with an explicit `type`. |
| `logger.info / error / warning / audit / metric (payload)` | Typed shortcuts (payload without `type`). |
| `logger.get(filters?, options?)` | Query stored logs. Returns the parsed backend response. |
| `logger.stream(filters?)` | Returns `{ body: ReadableStream<Uint8Array> }` wrapping the backend SSE stream; cancelling the stream aborts the request. |
| `logger.verifyWebhook({ signature, timestamp, body })` | Verifies an inbound HMAC-signed ULogs alert webhook via the backend; throws on mismatch. |

`get` and `stream` support the backend filters `type`, `appName`, `env`, `search`, `from`, `to`, `limit`, and authenticate with the API key by default. To read as a specific end user (e.g. a dashboard owner) pass a Clerk token instead:

```typescript
await logger.get({ type: "error", limit: 100 }, { authToken: clerkSessionToken });
```

### Delivery semantics

Writes are pushed into an in-memory buffer and flushed as a batch to `POST /logs/send` at most every 2 seconds. On `SIGINT`/`SIGTERM`/`beforeExit`, every active transport flushes once before exit. Failed flushes are logged to `console.error` (fire-and-forget; no retry queue yet). Each log carries an `ingested_at` client timestamp.

## React hooks

Client-side helpers for reading your logs in a Next.js app (expects a route handler or rewrite at `api/ulogs/logs`):

```tsx
"use client";
import { getLogs, getStream } from "@ulogs/next";

function History() {
  const { data, isLoading, error, refetch } = getLogs({ type: "error", limit: 100 });
  // data: LogRow[] — short-lived in-flight dedupe + 15s result cache per filter key
}

function Tail() {
  const { data, isLoading, error, connected, disconnect } = getStream({ env: "production" });
  // data: normalized { id, ts, level, source, message, payload }[] (capped at 5000 entries)
  // connected=false means the SSE link dropped; the hook auto-reconnects and falls back to 5s polling
}
```

## Alert webhook verification

When ULogs delivers an alert to your endpoint it signs the payload. Verify inside your route handler:

```typescript
const result = await logger.verifyWebhook({
  signature: req.headers["x-ulogs-signature"],
  timestamp: req.headers["x-ulogs-timestamp"],
  body: payload,
});
// throws if the signature/timestamp is rejected by the backend
```

## Local development (monorepo consumers)

This package is consumed inside the ULogs monorepo as a `file:` dependency, which links the **compiled `dist/`**, not `src/`. After changing SDK source:

```bash
npm run build     # tsc → dist/
```

The dashboard picks the change up on its next dev-server restart/rebuild.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript declarations + JS to `dist/` |
| `npm run clean` | Remove `dist/` |
| `npm pack --dry-run` | Preview publishable contents |
| `npm publish` | Runs `prepublishOnly` (clean + build), then publishes |

## License

ISC © ULogs Stack
