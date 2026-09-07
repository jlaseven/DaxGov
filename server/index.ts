import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDatabaseUrl, hydrateAppSecret, shouldApplyRemoteSchema } from "./secrets.js";
import { applyPostgresMigrations } from "./prismaMigrate.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await hydrateAppSecret();
await resolveDatabaseUrl();

if (shouldApplyRemoteSchema()) {
  applyPostgresMigrations(root);
}

const { default: app, prisma } = await import("./app.js");
const { ensureBootstrapAdmin } = await import("./auth.js");
const { ensureOrcaSeed } = await import("./orca.js");
const { ensureKriSeed } = await import("./kris.js");
const { ensureSqlitePreload } = await import("./sqlitePreload.js");
const { listenApp } = await import("./tls.js");

const port = Number(process.env.PORT) || 5174;
const host = process.env.HOST || "localhost";

await ensureBootstrapAdmin(prisma);
await ensureOrcaSeed(prisma);
await ensureKriSeed(prisma);
await ensureSqlitePreload(prisma);
listenApp(app, port, host);
