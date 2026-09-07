import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { databaseEngine } from "../server/database.js";
import { SQLITE_PRELOAD_SKIP } from "../server/sqlitePreload.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.resolve(
  process.argv[2] || path.join(root, "server", "sqlitePreload.json"),
);

if (databaseEngine() !== "sqlite") {
  throw new Error(
    "Export from the current SQLite database only. Leave DATABASE_URL pointing at governance.db.",
  );
}

const prisma = new PrismaClient();
const tables: Record<string, unknown[]> = {};

try {
  for (const model of Prisma.dmmf.datamodel.models) {
    if (SQLITE_PRELOAD_SKIP.has(model.name)) continue;
    const delegate = (
      prisma as unknown as Record<string, { findMany: () => Promise<unknown[]> }>
    )[model.name[0].toLowerCase() + model.name.slice(1)];
    if (!delegate?.findMany) {
      throw new Error(`No Prisma delegate for ${model.name}`);
    }
    tables[model.name] = await delegate.findMany();
  }
} finally {
  await prisma.$disconnect();
}

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(
  outputPath,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      source: "sqlite",
      tables,
    },
    (_key, value) => (value instanceof Date ? value.toISOString() : value),
    2,
  ),
);
console.log(`Wrote ${path.relative(root, outputPath)}`);
console.log("This file is a copy. prisma/governance.db was not modified.");
console.log(
  `Omitted ${[...SQLITE_PRELOAD_SKIP].join(", ")} so passwords and sessions stay out of the snapshot.`,
);
