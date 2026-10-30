import { describe, expect, it } from "vitest";

import { buildPoolConfig, isConnectionError, resolveDatasourceUrl, shouldRetryDbQuery } from "@/lib/db";

describe("buildPoolConfig", () => {
  it("strips sslmode=require from vault URLs and keeps encrypted, unverified SSL", () => {
    const config = buildPoolConfig("postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2?sslmode=require");

    expect(config.connectionString).toBe("postgresql://ro:secret@pg-ro.example.com:5432/vucar-v2");
    expect(config.ssl).toEqual({ rejectUnauthorized: false });
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

  it("does not retry schema or credential errors", () => {
    expect(shouldRetryDbQuery({ code: "42P01", message: 'relation "x" does not exist' })).toBe(false);
    expect(shouldRetryDbQuery({ code: "28P01", message: "password authentication failed" })).toBe(false);
  });
});
