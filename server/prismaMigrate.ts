import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { databaseEngine, databaseUrl } from "./database.js";

const require = createRequire(import.meta.url);

export function postgresSchemaPath(root: string) {
  return path.join(root, "deploy", "rds", "schema.prisma");
}

export function prismaSchemaForUrl(root: string, url = databaseUrl()) {
  const rds = postgresSchemaPath(root);
  if (databaseEngine(url) === "postgresql" && existsSync(rds)) return rds;
  return path.join(root, "prisma", "schema.prisma");
}

export function isSchemaNotEmptyError(output: string) {
  return /P3005|schema is not empty/i.test(output);
}

export function isEmptyDiffScript(sql: string) {
  return !sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("--"))
    .length;
}

export function listMigrationNames(schemaPath: string) {
  const dir = path.join(path.dirname(schemaPath), "migrations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function prismaCli() {
  return require.resolve("prisma/build/index.js");
}

function caughtOutput(error: unknown) {
  const err = error as {
    prismaOutput?: string;
    stdout?: string;
    stderr?: string;
    message?: string;
  };
  return (
    err.prismaOutput ||
    `${err.stdout || ""}\n${err.stderr || ""}\n${err.message || ""}`
  );
}

export function runPrisma(
  root: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env,
  options: { echo?: boolean } = {},
) {
  const echo = options.echo !== false;
  try {
    const output = execFileSync(process.execPath, [prismaCli(), ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (echo && output.trim()) process.stdout.write(output);
    return output;
  } catch (error) {
    const output = caughtOutput(error);
    if (echo && output.trim()) process.stderr.write(output);
    const wrapped = new Error(output.trim() || "Prisma command failed");
    (wrapped as Error & { prismaOutput: string }).prismaOutput = output;
    throw wrapped;
  }
}

function catchUpThenBaseline(root: string, schema: string) {
  const diff = runPrisma(root, [
    "migrate",
    "diff",
    "--from-url",
    databaseUrl(),
    "--to-schema-datamodel",
    schema,
    "--script",
  ]);
  if (!isEmptyDiffScript(diff)) {
    const dir = mkdtempSync(path.join(os.tmpdir(), "daxgov-pg-diff-"));
    const file = path.join(dir, "schema-catchup.sql");
    writeFileSync(file, diff, "utf8");
    try {
      runPrisma(root, ["db", "execute", "--file", file, "--schema", schema]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  for (const name of listMigrationNames(schema)) {
    try {
      runPrisma(root, [
        "migrate",
        "resolve",
        "--applied",
        name,
        "--schema",
        schema,
      ]);
    } catch (error) {
      const output = caughtOutput(error);
      if (!/P3008|already recorded|already been applied/i.test(output))
        throw error;
    }
  }
}

export function applyPostgresMigrations(root: string) {
  const schema = prismaSchemaForUrl(root);
  if (!existsSync(schema)) {
    throw new Error(`PostgreSQL Prisma schema not found at ${schema}`);
  }
  try {
    const output = runPrisma(
      root,
      ["migrate", "deploy", "--schema", schema],
      process.env,
      { echo: false },
    );
    if (output.trim()) process.stdout.write(output);
  } catch (error) {
    const output =
      (error as Error & { prismaOutput?: string }).prismaOutput ||
      String(error);
    if (!isSchemaNotEmptyError(output)) {
      process.stderr.write(output);
      throw error;
    }
    process.stdout.write(
      "Aurora already has tables. Catching up the schema and baselining Prisma migrations.\n",
    );
    catchUpThenBaseline(root, schema);
  }
}
