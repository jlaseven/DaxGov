import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "prisma", "schema.prisma");
const outputDir = path.join(root, "deploy", "rds");
const outputPath = path.join(outputDir, "schema.prisma");

const header = `// Generated from prisma/schema.prisma for Aurora Serverless (PostgreSQL).
// Local development still uses SQLite. The Docker image and AWS deploy use this schema.
`;

function withPostgresProvider(schema: string) {
  return schema.replace(
    /datasource db \{[\s\S]*?\n\}/,
    `datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}`,
  );
}

function withJumpCloudUserFields(schema: string) {
  if (schema.includes("jumpcloudSub")) return schema;
  return schema.replace(
    /model User \{([\s\S]*?)passwordHash String\n/,
    `model User {$1passwordHash String
  email        String?
  jumpcloudSub String?  @unique
  authProvider String   @default("local")
`,
  );
}

const schema = await readFile(sourcePath, "utf8");
await mkdir(outputDir, { recursive: true });
await writeFile(
  outputPath,
  `${header}${withJumpCloudUserFields(withPostgresProvider(schema))}`,
);
console.log(`Wrote ${path.relative(root, outputPath)}`);
console.log("SQLite was not changed. Use this schema in the AWS container image.");
