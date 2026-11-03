import { describe, expect, it, vi } from "vitest";

const pgMock = vi.hoisted(() => ({ active: 0, peak: 0, failuresLeft: 0, created: 0 }));

vi.mock("pg", () => ({
  Pool: class {
    constructor() {
      pgMock.created++;
    }
    on() {}
    async query() {
      if (pgMock.failuresLeft > 0) {
        pgMock.failuresLeft--;
        throw Object.assign(new Error('too many connections for role "vucar_data_ro"'), { code: "53300" });
      }
      pgMock.active++;
      pgMock.peak = Math.max(pgMock.peak, pgMock.active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      pgMock.active--;
      return { rows: [], rowCount: 0 };
    }
  },
}));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: vi.fn() }));

import {
  MAX_CONNECTIONS_PER_DATASOURCE,
  buildPoolConfig,
  isConnectionError,
  resolveDatasourceUrl,
  shouldRetryDbQuery,
  vucarV2Query,
} from "@/lib/db";

describe("buildPoolConfig", () => {
  it("strips sslmode=require from vault URLs and keeps encrypted, unverified SSL", () => {
    const config = buildPoolConfig("postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2?sslmode=require");

    expect(config.connectionString).toBe("postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
  });

  it("keeps few connections per instance and drops idle ones quickly", () => {
    const config = buildPoolConfig("postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2?sslmode=require");

    expect(config.max).toBe(MAX_CONNECTIONS_PER_DATASOURCE);
    expect(config.max).toBeLessThanOrEqual(5);
    expect(config.idleTimeoutMillis).toBeLessThanOrEqual(5_000);
  });

  it("turns SSL off for sslmode=disable (local databases)", () => {
    const config = buildPoolConfig("postgresql://postgres:secret@localhost:5544/vucar_zalo?sslmode=disable");

    expect(config.connectionString).toBe("postgresql://postgres:secret@localhost:5544/vucar_zalo");
    expect(config.ssl).toBe(false);
  });
});

describe("resolveDatasourceUrl", () => {
  it("reads the vault-named env var for each datasource", () => {
    expect(resolveDatasourceUrl("vucarV2", { VUCAR_V2_READ_DATABASE_URL: "postgresql://a" })).toBe("postgresql://a");
    expect(resolveDatasourceUrl("vucarZalo", { VUCAR_ZALO_READ_DATABASE_URL: "postgresql://b" })).toBe("postgresql://b");
  });

  it("names the missing env var instead of falling back to old split fields", () => {
    expect(() => resolveDatasourceUrl("vucarZalo", { ZALO_DB_HOST: "localhost" })).toThrow(
      "VuCar Zalo unavailable: VUCAR_ZALO_READ_DATABASE_URL is not set",
    );
  });
});

describe("isConnectionError", () => {
  it("treats DNS, refused and connect-timeout failures as connection errors", () => {
    expect(isConnectionError({ code: "ENOTFOUND", message: "getaddrinfo ENOTFOUND old-host" })).toBe(true);
    expect(isConnectionError({ code: "ECONNREFUSED", message: "connect ECONNREFUSED" })).toBe(true);
    expect(isConnectionError(new Error("timeout exceeded when trying to connect"))).toBe(true);
  });

  it("does not treat query errors as connection errors", () => {
    expect(isConnectionError({ code: "42P01", message: 'relation "x" does not exist' })).toBe(false);
  });
});

describe("shouldRetryDbQuery", () => {
  it("retries read-replica recovery conflicts", () => {
    expect(
      shouldRetryDbQuery({
        code: "40001",
        message: "canceling statement due to conflict with recovery",
      }),
    ).toBe(true);
  });

  it("retries when the shared read role is out of connections", () => {
    expect(shouldRetryDbQuery({ code: "53300", message: 'too many connections for role "vucar_data_ro"' })).toBe(true);
  });

  it("does not retry schema or credential errors", () => {
    expect(shouldRetryDbQuery({ code: "42P01", message: 'relation "x" does not exist' })).toBe(false);
    expect(shouldRetryDbQuery({ code: "28P01", message: "password authentication failed" })).toBe(false);
  });
});

describe("vucarV2Query concurrency", () => {
  it("never runs more queries at once than the per-datasource limit", async () => {
    vi.stubEnv("VUCAR_V2_READ_DATABASE_URL", "postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2");
    pgMock.peak = 0;

    await Promise.all(Array.from({ length: 12 }, () => vucarV2Query("select 1")));

    expect(pgMock.peak).toBe(MAX_CONNECTIONS_PER_DATASOURCE);
    expect(pgMock.created).toBe(1);
  });

  it("waits and retries when the role is momentarily full", async () => {
    vi.stubEnv("VUCAR_V2_READ_DATABASE_URL", "postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2");
    vi.useFakeTimers();
    pgMock.failuresLeft = 1;

    const result = vucarV2Query("select 1");
    await vi.advanceTimersByTimeAsync(1_100);

    await expect(result).resolves.toEqual({ rows: [], rowCount: 0 });
    vi.useRealTimers();
  });
});
