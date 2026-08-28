export type DatabaseEngine = "sqlite" | "postgresql" | "mysql" | "unknown";

export const FILE_BACKUP_UNSUPPORTED =
  "File backups are only available with the local SQLite database. Use Aurora snapshots after you migrate.";

export function databaseUrl(raw = process.env.DATABASE_URL) {
  return String(raw || "file:./governance.db").trim();
}

export function databaseEngine(url = databaseUrl()): DatabaseEngine {
  const value = url.toLowerCase();
  if (
    value.startsWith("file:") ||
    value.endsWith(".db") ||
    value.endsWith(".sqlite") ||
    value.endsWith(".sqlite3")
  )
    return "sqlite";
  if (value.startsWith("postgres://") || value.startsWith("postgresql://"))
    return "postgresql";
  if (value.startsWith("mysql://") || value.startsWith("mysqls://"))
    return "mysql";
  return "unknown";
}

export function usesSqliteFileBackups(url = databaseUrl()) {
  return databaseEngine(url) === "sqlite";
}

export function assertFileBackups(url = databaseUrl()) {
  if (!usesSqliteFileBackups(url)) throw new Error(FILE_BACKUP_UNSUPPORTED);
}

function safeUrlParts(url: string) {
  try {
    const parsed = new URL(url);
    const database = decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    return {
      host: parsed.hostname || null,
      port: parsed.port || null,
      database: database || null,
      user: decodeURIComponent(parsed.username || "") || null,
    };
  } catch {
    return { host: null, port: null, database: null, user: null };
  }
}

export function publicDatabaseStatus(url = databaseUrl()) {
  const engine = databaseEngine(url);
  if (engine === "sqlite") {
  return {
    engine,
    fileBackups: true as const,
    label: "Local SQLite",
    host: null as string | null,
    port: null as string | null,
    database: null as string | null,
    user: null as string | null,
  };
  }
  const parts = safeUrlParts(url);
  return {
    engine,
    fileBackups: false,
    label:
      engine === "postgresql"
        ? parts.host?.includes("rds.amazonaws.com")
          ? "Aurora Serverless (PostgreSQL)"
          : "PostgreSQL"
        : engine === "mysql"
          ? "Amazon RDS (MySQL)"
          : "Remote database",
    host: parts.host,
    port: parts.port,
    database: parts.database,
    user: parts.user,
  };
}
