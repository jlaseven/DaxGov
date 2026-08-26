import { createHash } from "node:crypto";
import { mkdir, copyFile, readdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertFileBackups,
  publicDatabaseStatus,
  usesSqliteFileBackups,
} from "./database.js";

const sqliteHeader = "SQLite format 3";
const snapshotPattern = /^governance-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db$/;

export function resolveDatabasePath() {
  const raw = (process.env.DATABASE_URL || "file:./governance.db").replace(
    /^file:/,
    "",
  );
  if (path.isAbsolute(raw)) return raw;
  return path.resolve(process.cwd(), "prisma", path.basename(raw));
}

export function backupDirectory(databasePath = resolveDatabasePath()) {
  return path.join(path.dirname(databasePath), "backups");
}

export function isSafeBackupName(fileName: string) {
  return snapshotPattern.test(fileName);
}

export function snapshotFileName(at = new Date()) {
  const stamp = new Date(at.getTime() - at.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 19)
    .replaceAll(":", "-");
  return `governance-${stamp}.db`;
}

export function isSqliteDatabase(buffer: Buffer) {
  return buffer.subarray(0, sqliteHeader.length).toString("utf8") === sqliteHeader;
}

export async function companionFiles(databasePath = resolveDatabasePath()) {
  return [databasePath, `${databasePath}-wal`, `${databasePath}-shm`];
}

export async function checkpointSqlite(prisma: {
  $executeRawUnsafe: (query: string) => Promise<unknown>;
}) {
  if (!usesSqliteFileBackups()) return;
  await prisma.$executeRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
}

export async function databaseStatus(databasePath = resolveDatabasePath()) {
  const publicStatus = publicDatabaseStatus();
  if (!usesSqliteFileBackups()) {
    return {
      ...publicStatus,
      fileName: publicStatus.database || publicStatus.host,
      sizeBytes: null,
      updatedAt: null,
    };
  }
  const info = await stat(databasePath);
  return {
    ...publicStatus,
    fileName: path.basename(databasePath),
    sizeBytes: info.size,
    updatedAt: info.mtime.toISOString(),
  };
}

export async function listSnapshots(databasePath = resolveDatabasePath()) {
  if (!usesSqliteFileBackups()) return [];
  const directory = backupDirectory(databasePath);
  await mkdir(directory, { recursive: true });
  const names = (await readdir(directory)).filter(isSafeBackupName);
  const snapshots = await Promise.all(
    names.map(async (fileName) => {
      const filePath = path.join(directory, fileName);
      const info = await stat(filePath);
      let sha256: string | null = null;
      try {
        sha256 = (await readFile(`${filePath}.sha256`, "utf8")).trim();
      } catch {
        sha256 = createHash("sha256")
          .update(await readFile(filePath))
          .digest("hex");
      }
      return {
        fileName,
        sizeBytes: info.size,
        createdAt: info.mtime.toISOString(),
        sha256,
      };
    }),
  );
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createSnapshot(
  databasePath = resolveDatabasePath(),
  at = new Date(),
) {
  assertFileBackups();
  const directory = backupDirectory(databasePath);
  await mkdir(directory, { recursive: true });
  const fileName = snapshotFileName(at);
  const destination = path.join(directory, fileName);
  await copyFile(databasePath, destination);
  const contents = await readFile(destination);
  const sha256 = createHash("sha256").update(contents).digest("hex");
  await writeFile(`${destination}.sha256`, `${sha256}\n`);
  const info = await stat(destination);
  return {
    fileName,
    sizeBytes: info.size,
    createdAt: info.mtime.toISOString(),
    sha256,
  };
}

export async function snapshotPath(
  fileName: string,
  databasePath = resolveDatabasePath(),
) {
  assertFileBackups();
  if (!isSafeBackupName(fileName))
    throw new Error("Backup file name is not allowed");
  return path.join(backupDirectory(databasePath), fileName);
}

export async function replaceDatabase(
  sourcePath: string,
  databasePath = resolveDatabasePath(),
) {
  assertFileBackups();
  const contents = await readFile(sourcePath);
  if (!isSqliteDatabase(contents))
    throw new Error("The selected file is not a SQLite database");
  for (const file of await companionFiles(databasePath)) {
    try {
      if (file !== databasePath) await unlink(file);
    } catch {
      // WAL/SHM files are absent when the database is already checkpointed.
    }
  }
  await copyFile(sourcePath, databasePath);
}

export async function writeUploadedDatabase(
  buffer: Buffer,
  databasePath = resolveDatabasePath(),
) {
  assertFileBackups();
  if (!isSqliteDatabase(buffer))
    throw new Error("The selected file is not a SQLite database");
  const directory = backupDirectory(databasePath);
  await mkdir(directory, { recursive: true });
  const tempPath = path.join(directory, `restore-${Date.now()}.tmp`);
  await writeFile(tempPath, buffer);
  try {
    await replaceDatabase(tempPath, databasePath);
  } finally {
    await unlink(tempPath).catch(() => undefined);
  }
}
