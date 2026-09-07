import { afterEach, describe, expect, it } from "vitest";
import {
  databaseNameFromEnv,
  parseSecretString,
  parseJsonObject,
  applyEnvFromObject,
  shouldLoadAppSecret,
  shouldLoadDatabaseSecret,
} from "../../server/secrets";

describe("database secret parsing", () => {
  afterEach(() => {
    delete process.env.DATABASE_NAME;
  });

  it("defaults the database name to daxgov", () => {
    expect(databaseNameFromEnv("")).toBe("daxgov");
    expect(databaseNameFromEnv("  governance  ")).toBe("governance");
  });

  it("rejects empty or non-JSON secret payloads", () => {
    expect(() => parseSecretString("")).toThrow(/empty secret/);
    expect(() => parseSecretString("{not-json")).toThrow(/JSON or a PostgreSQL URL/);
  });

  it("loads Secrets Manager whenever DATABASE_SECRET_ARN is set", () => {
    expect(shouldLoadDatabaseSecret("")).toBe(false);
    expect(
      shouldLoadDatabaseSecret("arn:aws:secretsmanager:x:secret:y"),
    ).toBe(true);
  });
});

describe("application secret hydration", () => {
  afterEach(() => {
    delete process.env.JUMPCLOUD_CLIENT_SECRET;
    delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
    delete process.env.APP_SECRET_ARN;
  });

  it("parses a JSON application secret", () => {
    expect(parseJsonObject('{"JUMPCLOUD_CLIENT_SECRET":"s3cret"}')).toEqual({
      JUMPCLOUD_CLIENT_SECRET: "s3cret",
    });
    expect(() => parseJsonObject("[]")).toThrow(/JSON object/);
  });

  it("copies secret keys into empty env vars and skips pointers", () => {
    const env: NodeJS.ProcessEnv = {
      APP_SECRET_ARN: "arn:aws:secretsmanager:x:secret:app",
      JUMPCLOUD_CLIENT_ID: "existing",
    };
    applyEnvFromObject(
      {
        APP_SECRET_ARN: "ignored",
        JUMPCLOUD_CLIENT_ID: "from-secret",
        JUMPCLOUD_CLIENT_SECRET: "s3cret",
        BOOTSTRAP_ADMIN_PASSWORD: "",
      },
      env,
    );
    expect(env.APP_SECRET_ARN).toBe("arn:aws:secretsmanager:x:secret:app");
    expect(env.JUMPCLOUD_CLIENT_ID).toBe("existing");
    expect(env.JUMPCLOUD_CLIENT_SECRET).toBe("s3cret");
    expect(env.BOOTSTRAP_ADMIN_PASSWORD).toBeUndefined();
  });

  it("loads the app secret when APP_SECRET_ARN is set", () => {
    expect(shouldLoadAppSecret("")).toBe(false);
    expect(shouldLoadAppSecret("arn:aws:secretsmanager:x:secret:app")).toBe(
      true,
    );
  });
});
