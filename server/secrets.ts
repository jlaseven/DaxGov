import { databaseEngine, databaseUrl } from "./database.js";

export type DatabaseSecretPayload = {
  username?: string;
  password?: string;
  host?: string;
  hostname?: string;
  port?: number | string;
  dbname?: string;
  database?: string;
  engine?: string;
  url?: string;
  DATABASE_URL?: string;
};

export function databaseNameFromEnv(raw = process.env.DATABASE_NAME) {
  const value = String(raw || "daxgov").trim();
  return value || "daxgov";
}

export function databaseUrlFromSecret(
  secret: DatabaseSecretPayload,
  dbName = databaseNameFromEnv(),
) {
  const direct = String(secret.url || secret.DATABASE_URL || "").trim();
  if (direct) return direct;
  const username = String(secret.username || "").trim();
  const password = String(secret.password || "");
  const host = String(secret.host || secret.hostname || "").trim();
  const port = String(secret.port || "5432").trim() || "5432";
  const name = String(secret.dbname || secret.database || dbName).trim();
  if (!username || !host || !name) {
    throw new Error(
      "Secrets Manager database secret must include username, host, and dbname (or url).",
    );
  }
  const encodedUser = encodeURIComponent(username);
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${encodedUser}:${encodedPassword}@${host}:${port}/${name}?sslmode=require`;
}

export function parseSecretString(raw: string): DatabaseSecretPayload {
  const value = raw.trim();
  if (!value) throw new Error("Secrets Manager returned an empty secret");
  if (value.startsWith("postgres://") || value.startsWith("postgresql://")) {
    return { url: value };
  }
  try {
    return JSON.parse(value) as DatabaseSecretPayload;
  } catch {
    throw new Error("Secrets Manager database secret must be JSON or a PostgreSQL URL");
  }
}

export function shouldLoadDatabaseSecret(
  secretArn = process.env.DATABASE_SECRET_ARN,
  url = process.env.DATABASE_URL,
) {
  return Boolean(String(secretArn || "").trim()) && !String(url || "").trim();
}

async function fetchSecretString(secretArn: string) {
  const region =
    process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "ap-southeast-1";
  const { SecretsManagerClient, GetSecretValueCommand } = await import(
    "@aws-sdk/client-secrets-manager"
  );
  const client = new SecretsManagerClient({ region });
  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );
  const fromString = response.SecretString;
  if (fromString) return fromString;
  if (response.SecretBinary) {
    return Buffer.from(response.SecretBinary).toString("utf8");
  }
  throw new Error("Secrets Manager did not return a database secret value");
}

export async function resolveDatabaseUrl() {
  const secretArn = String(process.env.DATABASE_SECRET_ARN || "").trim();
  if (shouldLoadDatabaseSecret(secretArn, process.env.DATABASE_URL)) {
    const payload = parseSecretString(await fetchSecretString(secretArn));
    process.env.DATABASE_URL = databaseUrlFromSecret(payload);
  }
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function shouldApplyRemoteSchema(url = databaseUrl()) {
  if (String(process.env.SKIP_DB_PUSH || "").toLowerCase() === "true")
    return false;
  return databaseEngine(url) === "postgresql";
}
