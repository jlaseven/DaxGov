import { describe, expect, it } from "vitest";
import {
  isSafeBackupName,
  isSqliteDatabase,
  snapshotFileName,
} from "../server/backup";

describe("database backup helpers", () => {
  it("accepts generated snapshot names and rejects path tricks", () => {
    const name = snapshotFileName(new Date("2026-08-17T06:30:00Z"));
    expect(isSafeBackupName(name)).toBe(true);
    expect(isSafeBackupName("../governance.db")).toBe(false);
    expect(isSafeBackupName("governance.db")).toBe(false);
  });

  it("recognizes a SQLite header", () => {
    expect(isSqliteDatabase(Buffer.from("SQLite format 3\0more"))).toBe(true);
    expect(isSqliteDatabase(Buffer.from("not sqlite"))).toBe(false);
  });
});
