import { describe, expect, it } from "vitest";

import { buildVucarZaloPoolConfig } from "@/lib/db";

describe("buildVucarZaloPoolConfig", () => {
  it("uses ZALO_DATABASE_URL before split Zalo DB env fields", () => {
    const config = buildVucarZaloPoolConfig({
      ZALO_DATABASE_URL: "postgresql://user:pass@zalo.example.com:5432/zalo_db",
      ZALO_DB_HOST: "localhost",
      ZALO_DB_NAME: "wrong_db",
      ZALO_DB_USER: "wrong_user",
      ZALO_DB_PASSWORD: "wrong_password",
    });

    expect(config).toMatchObject({
      connectionString: "postgresql://user:pass@zalo.example.com:5432/zalo_db",
      ssl: { rejectUnauthorized: false },
    });
    expect(config).not.toHaveProperty("host");
  });

  it("prefers ZALO_READ_REPLICA_DATABASE_URL over ZALO_DATABASE_URL", () => {
    const config = buildVucarZaloPoolConfig({
      ZALO_READ_REPLICA_DATABASE_URL: "postgresql://user:pass@zalo-read.example.com:5432/zalo_db",
      ZALO_DATABASE_URL: "postgresql://user:pass@zalo-primary.example.com:5432/zalo_db",
    });

    expect(config).toMatchObject({
      connectionString: "postgresql://user:pass@zalo-read.example.com:5432/zalo_db",
    });
  });

  it("keeps the split env fallback for older local setups", () => {
    const config = buildVucarZaloPoolConfig({
      ZALO_DB_HOST: "localhost",
      ZALO_DB_PORT: "5544",
      ZALO_DB_NAME: "vucar_zalo",
      ZALO_DB_USER: "postgres",
      ZALO_DB_PASSWORD: "secret",
      ZALO_DB_SSL_DISABLED: "false",
    });

    expect(config).toMatchObject({
      host: "localhost",
      port: 5544,
      database: "vucar_zalo",
      user: "postgres",
      password: "secret",
      ssl: false,
    });
  });
});
