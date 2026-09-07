import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  SQLITE_PRELOAD_SKIP,
  ensureSqlitePreload,
  readSqlitePreload,
  scalarInsertPayload,
  skipSqlitePreload,
} from "../../server/sqlitePreload";

describe("SQLite register preload", () => {
  let dir = "";

  afterEach(async () => {
    dir = "";
  });

  it("keeps passwords and sessions out of the snapshot", () => {
    expect([...SQLITE_PRELOAD_SKIP]).toEqual(
      expect.arrayContaining(["User", "Session", "ActivityLog"]),
    );
  });

  it("honors SKIP_SQLITE_PRELOAD", () => {
    expect(skipSqlitePreload({ SKIP_SQLITE_PRELOAD: "true" })).toBe(true);
    expect(skipSqlitePreload({ SKIP_SQLITE_PRELOAD: "false" })).toBe(false);
  });

  it("coerces DateTime strings and drops relation fields", () => {
    const payload = scalarInsertPayload("GovernanceDocument", {
      id: 9,
      documentName: "Access Control Policy",
      status: "Updated",
      cybersecurityPillar: "Protect",
      createdAt: "2026-01-02T00:00:00.000Z",
      documents: [{ id: 1 }],
    });
    expect(payload.id).toBe(9);
    expect(payload.documentName).toBe("Access Control Policy");
    expect(payload.createdAt).toEqual(new Date("2026-01-02T00:00:00.000Z"));
    expect(payload).not.toHaveProperty("documents");
  });

  it("skips preload on SQLite and when the snapshot file is missing", async () => {
    const missing = await ensureSqlitePreload({} as any, {
      filePath: path.join(os.tmpdir(), "daxgov-missing-preload.json"),
      env: { DATABASE_URL: "postgresql://daxgov:x@localhost:5432/daxgov" },
    });
    expect(missing).toEqual({
      applied: false,
      reason: "missing-file",
      tables: {},
    });
    const local = await ensureSqlitePreload({} as any, {
      env: { DATABASE_URL: "file:./governance.db" },
    });
    expect(local.reason).toBe("not-postgres");
  });

  it("inserts empty Aurora tables and leaves tables that already have rows", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "daxgov-preload-"));
    const filePath = path.join(dir, "sqlitePreload.json");
    await writeFile(
      filePath,
      JSON.stringify({
        source: "sqlite",
        tables: {
          GovernanceDocument: [
            {
              id: 1,
              documentName: "Access Control Policy",
              status: "Updated",
              cybersecurityPillar: "Protect",
              commentsRemarks: null,
              applicableStandards: null,
              applicableBspRegulations: null,
              createdAt: "2026-01-02T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
              archivedAt: null,
            },
          ],
          OrcaRisk: [{ id: 1, riskNo: "CYB-1-1" }],
        },
      }),
    );
    const inserted: Record<string, unknown[]> = {};
    const prisma = {
      governanceDocument: {
        count: async () => 0,
        createMany: async ({ data }: { data: Record<string, unknown>[] }) => {
          inserted.GovernanceDocument = data;
        },
      },
      orcaRisk: {
        count: async () => 30,
        createMany: async () => {
          throw new Error("should skip ORCA when rows already exist");
        },
      },
      $executeRawUnsafe: async () => undefined,
    };
    const result = await ensureSqlitePreload(prisma as any, {
      filePath,
      env: { DATABASE_URL: "postgresql://daxgov:x@localhost:5432/daxgov" },
    });
    expect(result.applied).toBe(true);
    expect(result.tables.GovernanceDocument).toEqual({ inserted: 1 });
    expect(result.tables.OrcaRisk).toEqual({ skipped: 30 });
    expect(inserted.GovernanceDocument?.[0]).toMatchObject({
      id: 1,
      documentName: "Access Control Policy",
    });
    expect(readSqlitePreload(filePath)?.tables.GovernanceDocument).toHaveLength(
      1,
    );
  });
});
