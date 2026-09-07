import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, type PrismaClient } from "@prisma/client";
import { databaseEngine } from "./database.js";

export const SQLITE_PRELOAD_SKIP = new Set([
  "User",
  "Session",
  "WatchItem",
  "NotificationRead",
  "ActivityLog",
]);

export const SQLITE_PRELOAD_ORDER = [
  "ApplicationSetting",
  "GovernanceDocument",
  "OpirAction",
  "AuditFinding",
  "Objective",
  "OkrTask",
  "Initiative",
  "SubInitiative",
  "Department",
  "IsraAssessment",
  "IsraRisk",
  "IsraQualityFinding",
  "InformationAsset",
  "TpsaRecord",
  "TpsaCertification",
  "TpsaFollowUp",
  "OrcaRisk",
  "KriSheet",
  "KriRecord",
  "OrcaMonitoringProfile",
  "KriThreshold",
  "KriSubmission",
  "KriOrcaMap",
  "OrcaRiskReview",
] as const;

export type SqlitePreloadFile = {
  exportedAt?: string;
  source?: string;
  tables: Record<string, Record<string, unknown>[]>;
};

export type SqlitePreloadReport = {
  applied: boolean;
  reason?: string;
  tables: Record<string, { inserted: number } | { skipped: number }>;
};

export function sqlitePreloadPath(
  fromMetaUrl = import.meta.url,
  fileName = "sqlitePreload.json",
) {
  return path.join(path.dirname(fileURLToPath(fromMetaUrl)), fileName);
}

export function skipSqlitePreload(env: NodeJS.ProcessEnv = process.env) {
  const raw = String(env.SKIP_SQLITE_PRELOAD || "").toLowerCase();
  return raw === "true" || raw === "1";
}

function modelMeta(name: string) {
  return Prisma.dmmf.datamodel.models.find((model) => model.name === name);
}

function delegateName(modelName: string) {
  return modelName[0].toLowerCase() + modelName.slice(1);
}

export function scalarInsertPayload(
  modelName: string,
  row: Record<string, unknown>,
) {
  const model = modelMeta(modelName);
  if (!model) throw new Error(`Unknown Prisma model ${modelName}`);
  const data: Record<string, unknown> = {};
  for (const field of model.fields) {
    if (field.kind !== "scalar") continue;
    if (!(field.name in row)) continue;
    const value = row[field.name];
    if (value == null) {
      data[field.name] = value;
      continue;
    }
    if (field.type === "DateTime") {
      data[field.name] = value instanceof Date ? value : new Date(String(value));
      continue;
    }
    data[field.name] = value;
  }
  return data;
}

export function readSqlitePreload(filePath: string): SqlitePreloadFile | null {
  if (!existsSync(filePath)) return null;
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as SqlitePreloadFile;
  if (!parsed || typeof parsed !== "object" || !parsed.tables) return null;
  return parsed;
}

async function resetIdSequence(prisma: PrismaClient, table: string) {
  if (!SQLITE_PRELOAD_ORDER.includes(table as (typeof SQLITE_PRELOAD_ORDER)[number]))
    return;
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), true)`,
  );
}

export async function ensureSqlitePreload(
  prisma: PrismaClient,
  options: { filePath?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<SqlitePreloadReport> {
  const env = options.env || process.env;
  if (skipSqlitePreload(env))
    return { applied: false, reason: "skipped", tables: {} };
  if (databaseEngine(env.DATABASE_URL) !== "postgresql")
    return { applied: false, reason: "not-postgres", tables: {} };

  const filePath = options.filePath || sqlitePreloadPath();
  const preload = readSqlitePreload(filePath);
  if (!preload) return { applied: false, reason: "missing-file", tables: {} };

  const report: SqlitePreloadReport = { applied: false, tables: {} };
  const client = prisma as unknown as Record<
    string,
    {
      count: () => Promise<number>;
      createMany: (args: { data: Record<string, unknown>[] }) => Promise<unknown>;
    }
  >;

  for (const name of SQLITE_PRELOAD_ORDER) {
    if (SQLITE_PRELOAD_SKIP.has(name)) continue;
    const rows = preload.tables[name];
    if (!rows?.length) continue;
    const delegate = client[delegateName(name)];
    if (!delegate?.count || !delegate.createMany) {
      throw new Error(`No Prisma delegate for ${name}`);
    }
    const existing = await delegate.count();
    if (existing > 0) {
      report.tables[name] = { skipped: existing };
      continue;
    }
    await delegate.createMany({
      data: rows.map((row) => scalarInsertPayload(name, row)),
    });
    await resetIdSequence(prisma, name);
    report.applied = true;
    report.tables[name] = { inserted: rows.length };
  }

  if (report.applied) {
    console.log(
      `Loaded SQLite register snapshot into Aurora: ${JSON.stringify(report.tables)}`,
    );
  }
  return report;
}
