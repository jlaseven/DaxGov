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
  env: NodeJS.ProcessEnv = process.env,
) {
  const direct = String(secret.url || secret.DATABASE_URL || "").trim();
  if (direct) return direct;
  const username = String(secret.username || "").trim();
  const password = String(secret.password || "");
  const host = String(
    secret.host || secret.hostname || env.DATABASE_HOST || "",
  ).trim();
  const port = String(secret.port || env.DATABASE_PORT || "5432").trim() || "5432";
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

const POINTER_ENV = new Set([
  "AWS_REGION",
  "AWS_DEFAULT_REGION",
  "APP_CONFIG_PARAMETER",
  "APP_SECRET_ARN",
  "DATABASE_SECRET_ARN",
  "DATABASE_URL",
]);

export function parseJsonObject(raw: string): Record<string, unknown> {
  const value = raw.trim();
  if (!value) throw new Error("Secrets Manager returned an empty secret");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Secrets Manager secret must be JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Secrets Manager secret must be a JSON object");
  return parsed as Record<string, unknown>;
}

export function applyEnvFromObject(
  payload: Record<string, unknown>,
  env: NodeJS.ProcessEnv = process.env,
) {
  for (const [key, value] of Object.entries(payload)) {
    if (POINTER_ENV.has(key)) continue;
    if (String(env[key] || "") !== "") continue;
    if (value == null) continue;
    const text = typeof value === "string" ? value : JSON.stringify(value);
    if (!text.trim()) continue;
    env[key] = text;
  }
}

export function shouldLoadAppSecret(
  secretArn = process.env.APP_SECRET_ARN,
) {
  return Boolean(String(secretArn || "").trim());
}

export function shouldLoadDatabaseSecret(
  secretArn = process.env.DATABASE_SECRET_ARN,
) {
  return Boolean(String(secretArn || "").trim());
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
  throw new Error("Secrets Manager did not return a secret value");
}

export async function hydrateAppSecret() {
  const secretArn = String(process.env.APP_SECRET_ARN || "").trim();
  if (!shouldLoadAppSecret(secretArn)) return;
  const payload = parseJsonObject(await fetchSecretString(secretArn));
  applyEnvFromObject(payload);
}

export async function resolveDatabaseUrl() {
  const secretArn = String(process.env.DATABASE_SECRET_ARN || "").trim();
  if (shouldLoadDatabaseSecret(secretArn)) {
    const payload = parseSecretString(await fetchSecretString(secretArn));
    process.env.DATABASE_URL = databaseUrlFromSecret(payload);
  }
  const url = databaseUrl();
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

export function shouldApplyRemoteSchema(url = databaseUrl()) {
  const skip = String(
    process.env.SKIP_DB_MIGRATE || process.env.SKIP_DB_PUSH || "",
  ).toLowerCase();
  if (skip === "true" || skip === "1") return false;
  return databaseEngine(url) === "postgresql";
}
