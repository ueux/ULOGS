import { createClient } from '@clickhouse/client';

const requiredEnvVars = {
  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
  CLICKHOUSE_USER: process.env.CLICKHOUSE_USER,
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
  CLICKHOUSE_DB: process.env.CLICKHOUSE_DB,
};

const missingVars = Object.entries(requiredEnvVars)
  .filter(([_, value]) => !value)
  .map(([key]) => key);

if (missingVars.length > 0) {
  console.error(
    `X Missing required ClickHouse environment variables: ${missingVars.join(', ')}`,
  );
  console.error(
    `Using default values - this may cause connection issues in production!`,
  );
}

export const clickhouse = createClient({
  url: process.env.CLICKHOUSE_URL || 'http://localhost:8123',
  username: process.env.CLICKHOUSE_USER || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DB || 'logs',
});
