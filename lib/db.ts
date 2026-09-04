import { Pool, type PoolConfig } from "pg";

const globalForDb = globalThis as unknown as {
  vucarV2Pool: Pool | undefined;
  e2ePool: Pool | undefined;
  vucarZaloPool: Pool | undefined;
};

type Env = Record<string, string | undefined>;

function sslConfigFromEnv(env: Env, ...envKeys: string[]): false | { rejectUnauthorized: false } {
  if (envKeys.some((key) => env[key] === "false" || env[key] === "true")) return false;
  return { rejectUnauthorized: false };
}

function splitPoolConfig(env: Env, prefix: string, sslKey: string): PoolConfig {
  return {
    host: env[`${prefix}_HOST`],
    port: parseInt(env[`${prefix}_PORT`] || "5432"),
    database: env[`${prefix}_NAME`],
    user: env[`${prefix}_USER`],
    password: env[`${prefix}_PASSWORD`],
    ssl: sslConfigFromEnv(env, sslKey),
    max: 15,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 20000,
  };
}

function urlPoolConfig(env: Env, connectionString: string, sslKeys: string[]): PoolConfig {
  return {
    connectionString,
    ssl: sslConfigFromEnv(env, ...sslKeys),
    max: 15,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 20000,
  };
}

export function buildVucarV2PoolConfig(env: Env = process.env): PoolConfig {
  if (env.VUCAR_V2_DATABASE_URL) {
    return urlPoolConfig(env, env.VUCAR_V2_DATABASE_URL, ["VUCAR_V2_DB_SSL_DISABLED"]);
  }
  return splitPoolConfig(env, "VUCAR_V2_DB", "VUCAR_V2_DB_SSL_DISABLED");
}

export function buildE2ePoolConfig(env: Env = process.env): PoolConfig {
  if (env.E2E_DATABASE_URL) {
    return urlPoolConfig(env, env.E2E_DATABASE_URL, ["E2E_DB_SSL_DISABLED"]);
  }
  return splitPoolConfig(env, "E2E_DB", "E2E_DB_SSL_DISABLED");
}

export function buildVucarZaloPoolConfig(env: Env = process.env): PoolConfig {
  const connectionString =
    env.ZALO_READ_REPLICA_DATABASE_URL ||
    env.ZALO_DATABASE_URL ||
    env.ZALO_CONNECTION_STRING;

  if (connectionString) {
    return urlPoolConfig(env, connectionString, ["ZALO_READ_REPLICA_SSL_DISABLED", "ZALO_DB_SSL_DISABLED"]);
  }

  return splitPoolConfig(env, "ZALO_DB", "ZALO_DB_SSL_DISABLED");
}

function getVucarV2Pool(): Pool {
  if (!globalForDb.vucarV2Pool) {
    globalForDb.vucarV2Pool = new Pool(buildVucarV2PoolConfig());
    globalForDb.vucarV2Pool.on("error", (err) => {
      console.error("Unexpected error on idle VuCar V2 client", err);
    });
  }
  return globalForDb.vucarV2Pool;
}

function getE2ePool(): Pool {
  if (!globalForDb.e2ePool) {
    globalForDb.e2ePool = new Pool(buildE2ePoolConfig());
    globalForDb.e2ePool.on("error", (err) => {
      console.error("Unexpected error on idle E2E client", err);
    });
  }
  return globalForDb.e2ePool;
}

export function getVucarZaloPool(): Pool {
  if (!globalForDb.vucarZaloPool) {
    globalForDb.vucarZaloPool = new Pool(buildVucarZaloPoolConfig());
    globalForDb.vucarZaloPool.on("error", (err) => {
      console.error("Unexpected error on idle VuCar Zalo client", err);
    });
  }
  return globalForDb.vucarZaloPool;
}

async function timedQuery(pool: Pool, label: string, text: string, params?: unknown[]) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    if (duration > 500) {
      console.warn(`Slow ${label} query detected:`, {
        duration: `${duration}ms`,
        query: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
        rowCount: res.rowCount,
      });
    }
    return res;
  } catch (error) {
    console.error(`${label.toLowerCase()} query error`, { text, error });
    throw error;
  }
}

export async function vucarV2Query(text: string, params?: unknown[]) {
  return timedQuery(getVucarV2Pool(), "VuCar V2", text, params);
}

export async function e2eQuery(text: string, params?: unknown[]) {
  return timedQuery(getE2ePool(), "E2E", text, params);
}

export async function vucarZaloQuery(text: string, params?: unknown[]) {
  return timedQuery(getVucarZaloPool(), "VuCar Zalo", text, params);
}
