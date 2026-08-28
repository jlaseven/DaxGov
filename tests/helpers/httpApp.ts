import { execSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function createTestApi(options?: {
  serveSpa?: boolean;
  spaDist?: string;
}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "daxgov-api-"));
  process.env.DATABASE_URL = `file:${path.join(dir, "test.db")}`;
  process.env.BCRYPT_COST = "4";
  process.env.LOGIN_MAX_ATTEMPTS = process.env.LOGIN_MAX_ATTEMPTS || "20";
  if (options?.serveSpa && options.spaDist) {
    process.env.SERVE_SPA = "true";
    process.env.SPA_DIST = options.spaDist;
  }
  execSync("npx prisma migrate deploy", {
    cwd: root,
    env: { ...process.env },
    stdio: "pipe",
  });
  const mod = await import("../../server/app");
  const request = ((await import("supertest")) as { default: typeof import("supertest") })
    .default;
  return {
    app: mod.default,
    prisma: mod.prisma,
    request,
    dir,
    async cleanup() {
      await mod.prisma.$disconnect();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

export async function loginAgent(
  request: typeof import("supertest"),
  app: unknown,
  username: string,
  password: string,
) {
  const agent = request.agent(app);
  const response = await agent
    .post("/api/login")
    .set("X-Requested-With", "DaxGov")
    .send({ username, password });
  return { agent, response };
}
