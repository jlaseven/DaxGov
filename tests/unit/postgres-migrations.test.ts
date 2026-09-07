import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  JUMPCLOUD_USER_MIGRATION,
  sqliteSqlToPostgres,
  writePostgresMigrations,
} from "../../scripts/postgresMigrations";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("PostgreSQL migration conversion", () => {
  let dir = "";

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
    dir = "";
  });

  it("rewrites SQLite types that Aurora PostgreSQL cannot run", () => {
    const sql = sqliteSqlToPostgres(`
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "expiresAt" DATETIME NOT NULL,
    "weight" REAL
);
ALTER TABLE "Session" ADD COLUMN "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;
`);
    expect(sql).toContain('"id" SERIAL NOT NULL PRIMARY KEY');
    expect(sql).toContain('"expiresAt" TIMESTAMP(3) NOT NULL');
    expect(sql).toContain('"weight" DOUBLE PRECISION');
    expect(sql).toContain(
      'ADD COLUMN "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    );
    expect(sql).not.toMatch(/AUTOINCREMENT|DATETIME|\bREAL\b/);
  });

  it("writes PostgreSQL migrations plus JumpCloud columns for Aurora", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "daxgov-pg-mig-"));
    const { names } = await writePostgresMigrations({
      sqliteMigrationsDir: path.join(root, "prisma", "migrations"),
      sqliteSchema: "model User { passwordHash String }",
      outputDir: dir,
    });
    expect(names).toContain("20260907100000_session_metadata_and_last_seen");
    expect(names).toContain(JUMPCLOUD_USER_MIGRATION);
    const lock = await readFile(path.join(dir, "migration_lock.toml"), "utf8");
    expect(lock).toMatch(/provider = "postgresql"/);
    const sessionSql = await readFile(
      path.join(dir, "20260907100000_session_metadata_and_last_seen", "migration.sql"),
      "utf8",
    );
    expect(sessionSql).toContain('ADD COLUMN "lastSeenAt" TIMESTAMP(3)');
    expect(sessionSql).toContain('ADD COLUMN "ip" TEXT');
    const jumpcloudSql = await readFile(
      path.join(dir, JUMPCLOUD_USER_MIGRATION, "migration.sql"),
      "utf8",
    );
    expect(jumpcloudSql).toContain('ADD COLUMN "jumpcloudSub" TEXT');
  });
});
