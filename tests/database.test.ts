import { describe, expect, it } from "vitest";
import {
  FILE_BACKUP_UNSUPPORTED,
  assertFileBackups,
  databaseEngine,
  publicDatabaseStatus,
  usesSqliteFileBackups,
} from "../server/database";

describe("database provider", () => {
  it("treats the current file URL as SQLite", () => {
    expect(databaseEngine("file:./governance.db")).toBe("sqlite");
    expect(usesSqliteFileBackups("file:./governance.db")).toBe(true);
    expect(publicDatabaseStatus("file:./governance.db")).toMatchObject({
      engine: "sqlite",
      fileBackups: true,
      label: "Local SQLite",
    });
    expect(publicDatabaseStatus("file:./governance.db")).not.toHaveProperty(
      "path",
    );
  });

  it("recognizes Aurora PostgreSQL URLs without exposing the password", () => {
    const url =
      "postgresql://daxgov:super-secret@governance.abc.ap-southeast-1.rds.amazonaws.com:5432/daxgov";
    expect(databaseEngine(url)).toBe("postgresql");
    expect(usesSqliteFileBackups(url)).toBe(false);
    expect(() => assertFileBackups(url)).toThrow(FILE_BACKUP_UNSUPPORTED);
    expect(publicDatabaseStatus(url)).toEqual({
      engine: "postgresql",
      fileBackups: false,
      label: "Aurora Serverless (PostgreSQL)",
      host: "governance.abc.ap-southeast-1.rds.amazonaws.com",
      port: "5432",
      database: "daxgov",
      user: "daxgov",
    });
  });
});
