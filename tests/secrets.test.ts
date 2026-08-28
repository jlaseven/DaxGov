import { describe, expect, it } from "vitest";
import {
  databaseUrlFromSecret,
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

  it("loads Secrets Manager only when DATABASE_URL is not already set", () => {
    expect(shouldLoadDatabaseSecret("arn:aws:secretsmanager:x:secret:y", "")).toBe(
      true,
    );
    expect(
      shouldLoadDatabaseSecret(
        "arn:aws:secretsmanager:x:secret:y",
        "file:./governance.db",
      ),
    ).toBe(false);
    expect(shouldLoadDatabaseSecret("", "")).toBe(false);
  });

  it("applies the remote schema only for PostgreSQL", () => {
    expect(shouldApplyRemoteSchema("file:./governance.db")).toBe(false);
    expect(
      shouldApplyRemoteSchema(
        "postgresql://daxgov:x@daxgov.cluster-abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov",
      ),
    ).toBe(true);
  });
});
