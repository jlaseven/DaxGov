import { describe, expect, it } from "vitest";
import {
  applyEnvFromObject,
  databaseUrlFromSecret,
  parseJsonObject,
  parseSecretString,
  shouldApplyRemoteSchema,
  shouldLoadDatabaseSecret,
} from "../server/secrets";

describe("Aurora Secrets Manager credentials", () => {
  it("builds a PostgreSQL URL from the RDS-managed secret JSON", () => {
    expect(
      databaseUrlFromSecret(
        {
          username: "daxgov",
          password: "p@ss:word/1",
          host: "daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com",
          port: 5432,
        },
        "daxgov",
      ),
    ).toBe(
      "postgresql://daxgov:p%40ss%3Aword%2F1@daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov?sslmode=require",
    );
  });

  it("uses DATABASE_HOST when the RDS-managed secret only has username and password", () => {
    expect(
      databaseUrlFromSecret(
        { username: "daxgov", password: "p@ss" },
        "daxgov",
        { DATABASE_HOST: "daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com" },
      ),
    ).toBe(
      "postgresql://daxgov:p%40ss@daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov?sslmode=require",
    );
  });

  it("prefers an explicit URL in the secret", () => {
    expect(
      parseSecretString("postgresql://daxgov:secret@db.example:5432/daxgov"),
    ).toEqual({ url: "postgresql://daxgov:secret@db.example:5432/daxgov" });
    expect(
      databaseUrlFromSecret({
        url: "postgresql://daxgov:secret@db.example:5432/daxgov",
        username: "ignored",
      }),
    ).toBe("postgresql://daxgov:secret@db.example:5432/daxgov");
  });

  it("loads Secrets Manager whenever DATABASE_SECRET_ARN is set", () => {
    expect(shouldLoadDatabaseSecret("arn:aws:secretsmanager:x:secret:y")).toBe(
      true,
    );
    expect(shouldLoadDatabaseSecret("")).toBe(false);
  });

  it("hydrates application secrets into empty environment variables", () => {
    expect(parseJsonObject('{"OIDC_STATE_SECRET":"abc"}')).toEqual({
      OIDC_STATE_SECRET: "abc",
    });
    const env: NodeJS.ProcessEnv = { DATABASE_URL: "file:./governance.db" };
    applyEnvFromObject(
      { DATABASE_URL: "postgresql://ignored", OIDC_STATE_SECRET: "abc" },
      env,
    );
    expect(env.DATABASE_URL).toBe("file:./governance.db");
    expect(env.OIDC_STATE_SECRET).toBe("abc");
  });

  it("applies the remote schema only for PostgreSQL", () => {
    expect(shouldApplyRemoteSchema("file:./governance.db")).toBe(false);
    expect(
      shouldApplyRemoteSchema(
        "postgresql://daxgov:x@daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov",
      ),
    ).toBe(true);
  });

  it("can skip Aurora migrate deploy", () => {
    const previousMigrate = process.env.SKIP_DB_MIGRATE;
    const previousPush = process.env.SKIP_DB_PUSH;
    const url =
      "postgresql://daxgov:x@daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov";
    try {
      process.env.SKIP_DB_MIGRATE = "true";
      expect(shouldApplyRemoteSchema(url)).toBe(false);
      delete process.env.SKIP_DB_MIGRATE;
      process.env.SKIP_DB_PUSH = "true";
      expect(shouldApplyRemoteSchema(url)).toBe(false);
    } finally {
      if (previousMigrate === undefined) delete process.env.SKIP_DB_MIGRATE;
      else process.env.SKIP_DB_MIGRATE = previousMigrate;
      if (previousPush === undefined) delete process.env.SKIP_DB_PUSH;
      else process.env.SKIP_DB_PUSH = previousPush;
    }
  });
});
