import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  isEmptyDiffScript,
  isSchemaNotEmptyError,
  prismaSchemaForUrl,
} from "../../server/prismaMigrate";

describe("Aurora Prisma migrate helpers", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

  it("uses the generated PostgreSQL schema for Aurora URLs", () => {
    expect(
      prismaSchemaForUrl(
        root,
        "postgresql://daxgov:x@cluster.rds.amazonaws.com:5432/daxgov",
      ),
    ).toBe(path.join(root, "deploy", "rds", "schema.prisma"));
    expect(prismaSchemaForUrl(root, "file:./governance.db")).toBe(
      path.join(root, "prisma", "schema.prisma"),
    );
  });

  it("detects an existing Aurora database that still needs baselining", () => {
    expect(
      isSchemaNotEmptyError(
        "Error: P3005\nThe database schema is not empty.",
      ),
    ).toBe(true);
    expect(isSchemaNotEmptyError("Error: P3009\nmigration failed")).toBe(false);
  });

  it("treats Prisma empty diffs as a no-op", () => {
    expect(isEmptyDiffScript("-- This is an empty migration.\n")).toBe(true);
    expect(
      isEmptyDiffScript('ALTER TABLE "Session" ADD COLUMN "ip" TEXT;\n'),
    ).toBe(false);
  });
});
