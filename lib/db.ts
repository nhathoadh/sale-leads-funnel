import { Pool, type PoolConfig } from "pg";

type Env = Record<string, string | undefined>;

// One read-only connection URL per datasource. Names match the Vucar vault
// (Infisical project vucar-data-pool), so values can be copied verbatim.
export const DATASOURCES = {
  vucarV2: { label: "VuCar V2", envKey: "VUCAR_V2_READ_DATABASE_URL" },
  vucarZalo: { label: "VuCar Zalo", envKey: "VUCAR_ZALO_READ_DATABASE_URL" },
} as const;

type DatasourceKey = keyof typeof DATASOURCES;

const RETRYABLE_DB_ERROR_CODES = new Set(["40001"]);
const MAX_DB_QUERY_ATTEMPTS = 3;
const CONNECTION_ERROR_CODES = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "28P01"]);
// After a connection-level failure, skip the datasource for this long instead of
// paying the DNS/connect timeout on every request.
const UNAVAILABLE_COOLDOWN_MS = 60_000;

const globalForDb = globalThis as unknown as {
  dbPools: Partial<Record<DatasourceKey, Pool>> | undefined;
  dbUnavailable: Partial<Record<DatasourceKey, { until: number; message: string }>> | undefined;
};
const pools = (globalForDb.dbPools ??= {});
const unavailable = (globalForDb.dbUnavailable ??= {});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function shouldRetryDbQuery(error: unknown) {
  const code = typeof (error as any)?.code === "string" ? (error as any).code : "";
  const message = typeof (error as any)?.message === "string" ? (error as any).message.toLowerCase() : "";
  return RETRYABLE_DB_ERROR_CODES.has(code) || message.includes("conflict with recovery");
}

export function isConnectionError(error: unknown) {
  const code = typeof (error as any)?.code === "string" ? (error as any).code : "";
  const message = typeof (error as any)?.message === "string" ? (error as any).message.toLowerCase() : "";
  return (
    CONNECTION_ERROR_CODES.has(code) ||
    message.includes("timeout exceeded when trying to connect") ||
    message.includes("connection terminated due to connection timeout")
  );
}

export class DatasourceUnavailableError extends Error {
  constructor(label: string, reason: string) {
    super(`${label} unavailable: ${reason}`);
    this.name = "DatasourceUnavailableError";
  }
}

/**
 * pg lets `sslmode` in the URL override the `ssl` option, and `sslmode=require`
 * there means full certificate verification. Strip it and decide SSL here:
 * `sslmode=disable` turns SSL off (local DBs), anything else is encrypted
 * without certificate verification, as before.
 */
export function buildPoolConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const sslDisabled = url.searchParams.get("sslmode") === "disable";
  url.searchParams.delete("sslmode");
  return {
    connectionString: url.toString(),
    ssl: sslDisabled ? false : { rejectUnauthorized: false },
    max: 15,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 10000,
  };
}

export function resolveDatasourceUrl(key: DatasourceKey, env: Env = process.env) {
  const { label, envKey } = DATASOURCES[key];
  const value = env[envKey]?.trim();
  if (!value) throw new DatasourceUnavailableError(label, `${envKey} is not set`);
  return value;
}

function getPool(key: DatasourceKey): Pool {
  let pool = pools[key];
  if (!pool) {
    pool = new Pool(buildPoolConfig(resolveDatasourceUrl(key)));
    pool.on("error", (err) => {
      console.error(`Unexpected error on idle ${DATASOURCES[key].label} client`, err);
    });
    pools[key] = pool;
  }
  return pool;
}

async function timedQuery(key: DatasourceKey, text: string, params?: unknown[]) {
  const { label } = DATASOURCES[key];
  const down = unavailable[key];
  if (down && down.until > Date.now()) throw new DatasourceUnavailableError(label, down.message);

  const pool = getPool(key);
  const start = Date.now();
  for (let attempt = 1; attempt <= MAX_DB_QUERY_ATTEMPTS; attempt++) {
    try {
      const res = await pool.query(text, params);
      delete unavailable[key];
      const duration = Date.now() - start;
      if (duration > 500) {
        console.warn(`Slow ${label} query detected:`, {
          duration: `${duration}ms`,
          query: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
          rowCount: res.rowCount,
          attempt,
        });
      }
      return res;
    } catch (error) {
      if (attempt < MAX_DB_QUERY_ATTEMPTS && shouldRetryDbQuery(error)) {
        console.warn(`${label} query retrying after transient replica error`, {
          attempt,
          code: (error as any)?.code,
          message: (error as any)?.message,
        });
        await sleep(250 * attempt);
        continue;
      }
      if (isConnectionError(error)) {
        const message = (error as any)?.message ?? String(error);
        unavailable[key] = { until: Date.now() + UNAVAILABLE_COOLDOWN_MS, message };
        console.error(`${label} unreachable, skipping it for ${UNAVAILABLE_COOLDOWN_MS / 1000}s:`, message);
        throw new DatasourceUnavailableError(label, message);
      }
      console.error(`${label.toLowerCase()} query error`, { text, error });
      throw error;
    }
  }
  throw new Error(`${label} query failed`);
}

export async function vucarV2Query(text: string, params?: unknown[]) {
  return timedQuery("vucarV2", text, params);
}

export async function vucarZaloQuery(text: string, params?: unknown[]) {
  return timedQuery("vucarZalo", text, params);
}
